"use strict";

/* =======================================================
   Global state
======================================================= */
let teamCount = 0;         // number of teams
let dataModified = false;  // unsaved changes guard

/* =======================================================
   Tiny utils
======================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function markAsModified() {
  dataModified = true;
}

/* =======================================================
   Firebase helpers (compat SDK expected)
======================================================= */
function ensureDbHandle() {
  // If firebase compat is present but window.db is missing, create it.
  if (!window.db && window.firebase?.firestore) {
    try { window.db = window.firebase.firestore(); } catch (e) {}
  }
}

async function ensureSignedIn() {
  // Requires auth-compat to be loaded BEFORE this script.
  if (!window.firebase?.auth) {
    throw new Error("Auth SDK missing — load firebase-auth-compat.js before app.js");
  }
  const auth = window.firebase.auth();
  if (auth.currentUser) return auth.currentUser;

  // Wait for an existing state or perform anonymous sign-in.
  await new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged(u => { if (u) { unsub(); resolve(); }});
    auth.signInAnonymously().catch(err => { unsub(); reject(err); });
  });
  return auth.currentUser;
}

/* =======================================================
   Row creation (no inline handlers)
======================================================= */
function addTeam() {
  teamCount++;
  dataModified = true;

  // Ensure a <tbody> exists
  const table = $("#teamTable");
  let tbody = table.querySelector("tbody");
  if (!tbody) {
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
  }

  const tr = document.createElement("tr");
  tr.dataset.teamId = String(teamCount); // reliable teamId source

  // --- Team name + bonus checkbox (left sticky col) ---
  const tdTeam = document.createElement("td");
  tdTeam.className = "sticky-col";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = `teamName${teamCount}`;
  nameInput.className = "teamName";
  nameInput.placeholder = `Team ${teamCount}`;

  const bonus = document.createElement("input");
  bonus.type = "checkbox";
  bonus.id = `checkbox${teamCount}`;
  bonus.className = "teamCheckbox";

  tdTeam.append(nameInput, bonus);
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

  // Final Question (free integer >= 0)
  {
    const td = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "number";
    inp.id = `finalQuestion${teamCount}`;
    inp.min = "0";
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
}

/* =======================================================
   Validation + scoring
======================================================= */
function validateInput(input, teamId) {
  const id = input.id;
  const rawValue = input.value;
  dataModified = true;

  // Halftime / Final Question: allow any non-negative int or empty
  if (id === `halfTime${teamId}` || id === `finalQuestion${teamId}`) {
    if (rawValue !== "" && (isNaN(parseInt(rawValue)) || parseInt(rawValue) < 0)) {
      input.value = "0";
    }
    updateScores(teamId);
    return;
  }

  // For numbered questions:
  const qMatch = id.match(/^num(\d+)(\d+)$/);
  if (qMatch) {
    const qNum = parseInt(qMatch[2], 10);
    if (rawValue === "") {
      // allow empty so user can clear
    } else if (qNum >= 1 && qNum <= 5) {
      // Round 1: only 0 or 1
      const v = parseInt(rawValue, 10);
      if (isNaN(v) || (v !== 0 && v !== 1)) input.value = "1";
    } else if (qNum >= 6 && qNum <= 10) {
      // Round 2: only 0 or 2
      const v = parseInt(rawValue, 10);
      if (isNaN(v) || (v !== 0 && v !== 2)) input.value = "2";
    } else if (qNum >= 11 && qNum <= 15) {
      // Round 3: only 0 or 3
      const v = parseInt(rawValue, 10);
      if (isNaN(v) || (v !== 0 && v !== 3)) input.value = "3";
    } else if (qNum >= 16 && qNum <= 20) {
      // Round 4: only 0 or 4
      const v = parseInt(rawValue, 10);
      if (isNaN(v) || (v !== 0 && v !== 4)) input.value = "4";
    }
  }

  updateScores(teamId);
}

function updateScores(teamId) {
  const valOrZero = (el) => (el?.value === "" ? 0 : parseInt(el?.value, 10) || 0);

  // Collect Q1..Q20
  const values = [];
  for (let j = 1; j <= 20; j++) {
    const el = document.getElementById(`num${teamId}${j}`);
    values.push(valOrZero(el));
  }

  // Halftime / Final Question
  const halfTimeValue = valOrZero(document.getElementById(`halfTime${teamId}`));
  const finalQuestionValue = valOrZero(document.getElementById(`finalQuestion${teamId}`));

  // Totals
  const r1Total = values.slice(0, 5).reduce((a, b) => a + b, 0);
  const r2Total = values.slice(5, 10).reduce((a, b) => a + b, 0);
  const r3Total = values.slice(10, 15).reduce((a, b) => a + b, 0);
  const r4Total = values.slice(15, 20).reduce((a, b) => a + b, 0);

  const firstHalfTotal = r1Total + r2Total + halfTimeValue;
  const secondHalfTotal = r3Total + r4Total + finalQuestionValue;

  // Final score (+5 if bonus checked)
  let finalScore = firstHalfTotal + secondHalfTotal;
  const bonus = document.getElementById(`checkbox${teamId}`);
  if (bonus && bonus.checked) finalScore += 5;

  // Update DOM
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  setText(`r1Total${teamId}`, r1Total);
  setText(`r2Total${teamId}`, r2Total);
  setText(`r3Total${teamId}`, r3Total);
  setText(`r4Total${teamId}`, r4Total);
  setText(`firstHalfTotal${teamId}`, firstHalfTotal);
  setText(`secondHalfTotal${teamId}`, secondHalfTotal);
  setText(`finalScore${teamId}`, finalScore);
}

function updateFinalScore(teamId) {
  dataModified = true;
  updateScores(teamId);
}

/* =======================================================
   Standings modal
======================================================= */
function showStandings() {
  // ensure all scores current
  for (let i = 1; i <= teamCount; i++) updateScores(i);

  const modal = $("#standingsModal");
  if (!modal) return;

  // Display the modal (support both techniques)
  modal.removeAttribute("hidden");
  modal.style.display = "block";

  const modalList = $("#modalRankingList");
  if (!modalList) return;
  modalList.innerHTML = "";

  // Build ranking
  const teams = [];
  for (let i = 1; i <= teamCount; i++) {
    const name = (document.getElementById(`teamName${i}`)?.value || `Team ${i}`);
    const finalScore = parseInt(document.getElementById(`finalScore${i}`)?.textContent || "0", 10);
    const firstHalf = parseInt(document.getElementById(`firstHalfTotal${i}`)?.textContent || "0", 10);
    const secondHalf = parseInt(document.getElementById(`secondHalfTotal${i}`)?.textContent || "0", 10);
    teams.push({ name, score: finalScore, firstHalf, secondHalf });
  }

  teams.sort((a, b) => b.score - a.score);

  teams.forEach((t, idx) => {
    const li = document.createElement("li");
    li.textContent = `${idx + 1}. ${t.name} - Score: ${t.score} (First Half: ${t.firstHalf}, Second Half: ${t.secondHalf})`;
    if (idx === 0) {
      li.style.borderLeft = "6px solid gold";
      li.style.background = "linear-gradient(to right, #3a3a3a, #4a4a4a)";
    } else if (idx === 1) {
      li.style.borderLeft = "6px solid silver";
    } else if (idx === 2) {
      li.style.borderLeft = "6px solid #cd7f32";
    }
    modalList.appendChild(li);
  });
}

function closeModal() {
  const modal = $("#standingsModal");
  if (!modal) return;
  modal.setAttribute("hidden", "");
  modal.style.display = "none";
}

/* =======================================================
   Search (with suggestions)
======================================================= */
function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i++) track[0][i] = i;
  for (let j = 0; j <= str2.length; j++) track[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,        // deletion
        track[j - 1][i] + 1,        // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return track[str2.length][str1.length];
}

function searchTeams() {
  const input = $("#teamSearch");
  const searchTerm = (input?.value || "").toLowerCase().trim();
  if (!searchTerm) { clearHighlights(); return; }

  const teamNameInputs = $all(".teamName");
  clearHighlights();

  const matches = [];
  for (const el of teamNameInputs) {
    const name = (el.value || "").toLowerCase().trim();
    if (!name) continue;

    if (name === searchTerm) { highlightTeam(el); return; }

    const contains = name.includes(searchTerm);
    const containedBy = searchTerm.includes(name);
    const startsWith = name.startsWith(searchTerm);
    const distance = levenshteinDistance(name, searchTerm);

    let score = distance;
    if (contains) score -= 2;
    if (startsWith) score -= 3;
    if (containedBy && name.length > 2) score -= 1;

    const threshold = Math.max(4, Math.min(searchTerm.length, name.length) / 2);
    if (score < threshold) matches.push({ element: el, name, score });
  }

  matches.sort((a, b) => a.score - b.score);

  if (matches.length > 0) {
    highlightTeam(matches[0].element);
    if (matches.length > 1 && matches[0].score > 0) {
      showSuggestions(matches.slice(0, Math.min(5, matches.length)));
    }
  } else {
    alert("No team found with that name. Try a different search term.");
  }
}

function highlightTeam(teamNameInput) {
  const teamRow = teamNameInput.closest("tr");
  if (!teamRow) return;
  teamRow.classList.add("highlighted-row");
  scrollToTeam(teamRow);
}

function showSuggestions(matches) {
  removeExistingSuggestions();

  const container = document.createElement("div");
  container.className = "search-suggestions";
  container.innerHTML = "<p>Did you mean:</p>";

  const ul = document.createElement("ul");
  for (const m of matches) {
    const li = document.createElement("li");
    li.textContent = m.name;
    li.addEventListener("click", () => {
      const input = $("#teamSearch");
      if (input) input.value = m.name;
      removeExistingSuggestions();
      highlightTeam(m.element);
    });
    ul.appendChild(li);
  }
  container.appendChild(ul);

  const searchContainer = $(".search-container");
  searchContainer?.appendChild(container);

  setTimeout(() => {
    if ($(".search-suggestions")) removeExistingSuggestions();
  }, 10000);
}

function removeExistingSuggestions() {
  const existing = $(".search-suggestions");
  if (existing) existing.remove();
}

function clearHighlights() {
  $all(".highlighted-row").forEach((row) => row.classList.remove("highlighted-row"));
  removeExistingSuggestions();
}

function scrollToTeam(teamRow) {
  const wrapper = $(".table-wrapper");
  const headerH = $("thead")?.offsetHeight || 0;
  const y = (teamRow?.offsetTop || 0) - headerH - 10;
  wrapper?.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

/* =======================================================
   Data collection
======================================================= */
function collectTeamData() {
  const teamsData = [];

  for (let i = 1; i <= teamCount; i++) {
    const teamName = document.getElementById(`teamName${i}`)?.value || `Team ${i}`;
    const bonusApplied = !!document.getElementById(`checkbox${i}`)?.checked;

    const questionScores = {};
    for (let j = 1; j <= 20; j++) {
      const el = document.getElementById(`num${i}${j}`);
      const raw = el?.value;
      questionScores[`Q${j}`] = raw === "" ? null : (parseInt(raw, 10) || 0);
    }

    const halfTimeRaw = document.getElementById(`halfTime${i}`)?.value;
    const halfTimeScore = halfTimeRaw === "" ? null : (parseInt(halfTimeRaw || "0", 10) || 0);

    const finalQRaw = document.getElementById(`finalQuestion${i}`)?.value;
    const finalQuestionScore = finalQRaw === "" ? null : (parseInt(finalQRaw || "0", 10) || 0);

    const r1Total = parseInt(document.getElementById(`r1Total${i}`)?.textContent || "0", 10);
    const r2Total = parseInt(document.getElementById(`r2Total${i}`)?.textContent || "0", 10);
    const r3Total = parseInt(document.getElementById(`r3Total${i}`)?.textContent || "0", 10);
    const r4Total = parseInt(document.getElementById(`r4Total${i}`)?.textContent || "0", 10);
    const firstHalfTotal = parseInt(document.getElementById(`firstHalfTotal${i}`)?.textContent || "0", 10);
    const secondHalfTotal = parseInt(document.getElementById(`secondHalfTotal${i}`)?.textContent || "0", 10);
    const finalScore = parseInt(document.getElementById(`finalScore${i}`)?.textContent || "0", 10);

    teamsData.push({
      teamId: i,
      teamName,
      bonusApplied,
      questionScores,
      halfTimeScore,
      finalQuestionScore,
      roundTotals: { r1Total, r2Total, r3Total, r4Total },
      firstHalfTotal,
      secondHalfTotal,
      finalScore,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    eventName: "Trivia Night",
    teamCount,      // number already numeric; will be coerced again before submit
    teams: teamsData,
  };
}

/* =======================================================
   Firestore submit (compat)
======================================================= */
async function sendDataToAPI(data) {
  try {
    ensureDbHandle();
    if (!window.db) throw new Error("Firebase Firestore is not initialized");

    // 1) sign in BEFORE write so rules see request.auth != null
    await ensureSignedIn();

    // 2) coerce payload to satisfy rules
    const safe = { ...data };
    safe.timestamp = new Date().toISOString();
    safe.eventName = (typeof safe.eventName === "string" && safe.eventName) ? safe.eventName : "Trivia Night";
    safe.teamCount = Number.isFinite(safe.teamCount) ? Math.trunc(safe.teamCount) : 0;
    safe.teams = Array.isArray(safe.teams) ? safe.teams : [];

    // 3) compat write via window.db
    const docRef = await window.db.collection("scores").add(safe);
    console.log("Document written with ID:", docRef.id);

    dataModified = false;
    return { id: docRef.id, success: true };
  } catch (error) {
    console.error("Error sending data to Firestore:", error);
    alert("Failed to submit scores to Firebase. Please try again or save locally.");
    throw error;
  }
}

/* =======================================================
   Local save
======================================================= */
function saveDataLocally(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `trivia_scores_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);

  dataModified = false;
}

/* =======================================================
   Global guards
======================================================= */
window.addEventListener("beforeunload", (e) => {
  if (dataModified) {
    const message = "You have unsaved changes. Are you sure you want to leave?";
    e.returnValue = message;
    return message;
  }
});

/* =======================================================
   Event delegation + initial setup
======================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Ensure tbody exists
  const table = $("#teamTable");
  if (table && !table.querySelector("tbody")) {
    table.appendChild(document.createElement("tbody"));
  }

  // Add 5 default teams
  for (let i = 1; i <= 5; i++) addTeam();
  dataModified = false;

  // Delegate input events for all score inputs (CSP friendly)
  table?.addEventListener("input", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;

    // Team row + id
    const row = target.closest("tr[data-team-id]");
    if (!row) return;
    const teamId = parseInt(row.dataset.teamId || "0", 10);
    if (!teamId) return;

    if (target.classList.contains("teamName")) {
      markAsModified();
      return;
    }

    // Only validate score-ish inputs
    if (
      target.id === `halfTime${teamId}` ||
      target.id === `finalQuestion${teamId}` ||
      /^num\d+\d+$/.test(target.id)
    ) {
      validateInput(target, teamId);
    }
  });

  // Checkbox change → recompute final score
  table?.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains("teamCheckbox")) return;

    const row = target.closest("tr[data-team-id]");
    if (!row) return;
    const teamId = parseInt(row.dataset.teamId || "0", 10);
    if (!teamId) return;

    updateFinalScore(teamId);
  });

  // Buttons
  const btnAddTeam = $("#btnAddTeam");
  if (btnAddTeam && !btnAddTeam.dataset.bound) {
    btnAddTeam.addEventListener("click", () => addTeam());
    btnAddTeam.dataset.bound = "1";
  }

  const btnShowStandings = $("#btnShowStandings");
  if (btnShowStandings && !btnShowStandings.dataset.bound) {
    btnShowStandings.addEventListener("click", () => showStandings());
    btnShowStandings.dataset.bound = "1";
  }

  const btnCloseModal = $("#btnCloseModal");
  if (btnCloseModal && !btnCloseModal.dataset.bound) {
    btnCloseModal.addEventListener("click", () => closeModal());
    btnCloseModal.dataset.bound = "1";
  }

  const btnSubmit = $("#btnSubmitScores");
  if (btnSubmit && !btnSubmit.dataset.bound) {
    btnSubmit.addEventListener("click", async () => {
      // Recompute totals before submit
      for (let i = 1; i <= teamCount; i++) updateScores(i);

      const scoresData = collectTeamData();
      const action = confirm(
        "Do you want to submit scores to the Firebase database? Click OK to submit, or Cancel to save as a local file."
      );

      if (action) {
        try {
          await sendDataToAPI(scoresData);
          alert("Scores submitted successfully to Firebase!");
        } catch {
          if (confirm("Firebase submission failed. Would you like to save the data locally instead?")) {
            saveDataLocally(scoresData);
          }
        }
      } else {
        saveDataLocally(scoresData);
      }
    });
    btnSubmit.dataset.bound = "1";
  }

  // Search field wiring
  const searchInput = $("#teamSearch");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") searchTeams();
      if (!searchInput.value.trim()) clearHighlights();
    });
    searchInput.addEventListener(
      "input",
      debounce(function () {
        if (this.value.trim().length >= 2) searchTeams();
        else clearHighlights();
      }, 300)
    );
    searchInput.dataset.bound = "1";
  }

  const btnSearch = $("#btnSearch");
  if (btnSearch && !btnSearch.dataset.bound) {
    btnSearch.addEventListener("click", () => searchTeams());
    btnSearch.dataset.bound = "1";
  }
});

/* =======================================================
   Expose a few functions globally (optional)
======================================================= */
window.addTeam = addTeam;
window.showStandings = showStandings;
window.closeModal = closeModal;
window.searchTeams = searchTeams;
window.clearHighlights = clearHighlights;
// === [scoresheet][HOST] GRID ENFORCER: per-Q columns; non-zero => round value ===
(() => {
  if (window.__HOST_GRID_ENFORCER__) return; window.__HOST_GRID_ENFORCER__ = 1;

  const roundForQ = (q) => (q>=1 && q<=20) ? Math.ceil(q/5) : null; // 1..4

  // Build header grid honoring rowSpan/colSpan; returns {cols, qByCol[]}
  function mapHeader(table){
    const thead = table.tHead; if (!thead) return { cols:0, qByCol:[] };
    const rows = Array.from(thead.rows);
    // upper-bound columns: max colSpan sum of any row
    let maxCols = 0;
    rows.forEach(r => {
      let sum = 0; for (const c of r.cells) sum += Number(c.colSpan||1);
      maxCols = Math.max(maxCols, sum);
    });

    // grid placement with rowSpan accounting
    const occ = Array(maxCols).fill(0);
    const grid = rows.map(()=>Array(maxCols).fill(null));

    rows.forEach((r, ri) => {
      let col = 0;
      for (const cell of r.cells) {
        while (occ[col] > 0) col++;
        const cs = Number(cell.colSpan||1);
        const rs = Number(cell.rowSpan||1);
        for (let i=0;i<cs;i++) {
          grid[ri][col+i] = cell;
          occ[col+i] = rs;   // mark occupied for rs rows (including this one)
        }
        col += cs;
      }
      for (let i=0;i<maxCols;i++) if (occ[i]>0) occ[i]--; // advance to next row
    });

    // choose the row with most Q labels
    let bestRow = 0, bestScore = -1;
    grid.forEach((arr, ri) => {
      const score = arr.reduce((acc, cell) => {
        const t = (cell?.textContent||'').trim();
        return acc + (/\bQ\s*\d+\b/i.test(t) ? 1 : 0);
      }, 0);
      if (score > bestScore) { bestScore = score; bestRow = ri; }
    });

    const qByCol = Array(maxCols).fill(null);
    for (let col=0; col<maxCols; col++) {
      const cell = grid[bestRow][col];
      const m = (cell?.textContent||'').match(/\bQ\s*([0-9]{1,2})\b/i);
      if (m) qByCol[col] = Number(m[1]);
    }
    return { cols:maxCols, qByCol };
  }

  // Find the <td> that covers a given column index, respecting colSpan
  function getCellAtCol(tr, colIndex){
    let pos = 0;
    for (const td of tr.cells) {
      const span = Number(td.colSpan||1);
      if (colIndex >= pos && colIndex < pos + span) return td;
      pos += span;
    }
    return null;
  }

  function findEditor(td){
    return td.querySelector('input, [contenteditable="true"], [contenteditable=""]')
        || td.querySelector('input, div, span');
  }

  function bind(el, allowed){
    if (el.__gridBound) return;
    el.__gridBound = true;

    const coerce = (raw) => {
      const s = String(raw ?? '').replace(/[^\d]/g,'');
      if (s === '') return '';           // allow temporary empty
      const n = Number(s);
      if (n === 0) return '0';
      return String(allowed);            // any non-zero snaps to 1/2/3/4
    };

    const apply = () => {
      if (el.tagName === 'INPUT') el.value = coerce(el.value);
      else el.textContent = coerce(el.textContent);
    };

    if (el.tagName === 'INPUT') {
      el.setAttribute('inputmode','numeric');
      el.setAttribute('min','0'); el.setAttribute('max', String(allowed));
      el.setAttribute('step', String(allowed));     // spinner toggles 0 <-> allowed
      el.addEventListener('input', apply, { passive:true });
      el.addEventListener('change', apply);
      el.addEventListener('blur', () => { if (el.value === '') el.value = '0'; });
      el.addEventListener('keydown', (e)=>{ if(['e','E','+','-','.'].includes(e.key)) e.preventDefault(); });
    } else {
      el.setAttribute('contenteditable','true');
      el.addEventListener('input', apply);
      el.addEventListener('blur', () => { if ((el.textContent||'') === '') el.textContent = '0'; });
      el.addEventListener('keydown', (e)=>{ if(['e','E','+','-','.'].includes(e.key)) e.preventDefault(); });
    }
    apply(); // normalize immediately
  }

  function run(){
    document.querySelectorAll('table').forEach(table => {
      const { cols, qByCol } = mapHeader(table);
      if (!cols) return;

      for (const tbody of table.tBodies) {
        for (const tr of tbody.rows) {
          for (let col=0; col<cols; col++) {
            const q = qByCol[col]; if (!q) continue;
            const allowed = roundForQ(q); if (!allowed) continue;
            const td = getCellAtCol(tr, col); if (!td) continue;
            const el = findEditor(td); if (!el) continue;
            bind(el, allowed);
          }
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true });
  else run();
  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();
// === end GRID ENFORCER ===
// === [scoresheet][HOST] TABLE NAVIGATION v2 — intercept Arrow keys on inputs ===
(() => {
  if (window.__HOST_TABLE_NAV_V2__) return; window.__HOST_TABLE_NAV_V2__ = 1;

  function buildHeaderGrid(table){
    const thead = table.tHead; if (!thead) return {cols:0, grid:[], labels:[]};
    const rows = Array.from(thead.rows);
    let maxCols = 0;
    rows.forEach(r => { let s=0; for (const c of r.cells) s += Number(c.colSpan||1); maxCols = Math.max(maxCols, s); });

    const occ = Array(maxCols).fill(0);
    const grid = rows.map(()=>Array(maxCols).fill(null));
    rows.forEach((r,ri) => {
      let col = 0;
      for (const cell of r.cells) {
        while (occ[col] > 0) col++;
        const cs = Number(cell.colSpan||1), rs = Number(cell.rowSpan||1);
        for (let i=0;i<cs;i++){ grid[ri][col+i]=cell; occ[col+i]=rs; }
        col += cs;
      }
      for (let i=0;i<maxCols;i++) if (occ[i]>0) occ[i]--;
    });

    const labels = Array(maxCols).fill(null);
    for (let c=0;c<maxCols;c++){
      let label = '';
      for (let r=0;r<grid.length;r++){
        const t = (grid[r][c]?.textContent || '').trim();
        if (t) label = t;
      }
      labels[c] = label;
    }
    return { cols: maxCols, grid, labels };
  }

  function getCellAtCol(tr, colIndex){
    let pos=0;
    for (const td of tr.cells){
      const span = Number(td.colSpan||1);
      if (colIndex >= pos && colIndex < pos + span) return td;
      pos += span;
    }
    return null;
  }

  function findEditor(td){
    return td?.querySelector('input, [contenteditable="true"], [contenteditable=""]')
        || td?.querySelector('input, div, span') || null;
  }

  function indexTable(table){
    const {cols, labels} = buildHeaderGrid(table);
    const rows = [];
    for (const tb of table.tBodies) for (const tr of tb.rows) rows.push(tr);

    // Navigable columns include Team Name, any Q##, Halftime, Final,
    // plus any column that actually contains an editor.
    const navCols = Array(cols).fill(false);
    const labelIsNav = (txt) => {
      const t = (txt || '').toLowerCase();
      return /\bq\s*\d+\b/.test(t) || /team(\s*name)?/.test(t) || /half[\s-]?time/.test(t) || /\bfinal\b/.test(t);
    };
    for (let c=0;c<cols;c++){
      if (labelIsNav(labels[c])) { navCols[c] = true; continue; }
      for (let i=0; i<Math.min(rows.length, 6); i++){
        const td = getCellAtCol(rows[i], c);
        if (td && findEditor(td)) { navCols[c] = true; break; }
      }
    }
    return { rows, cols, navCols };
  }

  function currentColIndex(tr, td){
    let pos=0;
    for (const cell of tr.cells){
      const span = Number(cell.colSpan||1);
      if (cell === td) return pos;
      pos += span;
    }
    return -1;
  }

  function moveFocus(fromEditor, dx, dy){
    const table = fromEditor.closest('table'); if (!table) return;
    const {rows, cols, navCols} = indexTable(table);

    const fromTd = fromEditor.closest('td,th'); if (!fromTd) return;
    const fromTr = fromTd.parentElement;
    const rIdx = rows.indexOf(fromTr);
    let cIdx = currentColIndex(fromTr, fromTd);
    if (cIdx < 0) return;

    // Horizontal: go to previous/next navigable column; clamp at edges
    if (dx) {
      let step = dx > 0 ? 1 : -1;
      let c = cIdx + step;
      while (c >= 0 && c < cols && !navCols[c]) c += step;
      if (c >= 0 && c < cols && navCols[c]) cIdx = c;
    }

    // Vertical: same column, different row; clamp within bounds
    let rTarget = Math.max(0, Math.min(rows.length - 1, rIdx + (dy||0)));

    const targetTr = rows[rTarget];
    const targetTd = getCellAtCol(targetTr, cIdx);
    const targetEl = findEditor(targetTd);
    if (targetEl) {
      targetEl.focus();
      if (targetEl.select) targetEl.select();
    }
  }

  function handleArrowKey(e){
    const k = e.key;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)) return;
    // Stop number-input stepping & caret movement
    e.preventDefault();
    e.stopImmediatePropagation();
    moveFocus(e.currentTarget,
      k==='ArrowRight'? 1 : k==='ArrowLeft'? -1 : 0,
      k==='ArrowDown' ? 1 : k==='ArrowUp'   ? -1 : 0
    );
  }

  function bindNavHandlers(){
    document.querySelectorAll('table').forEach(table => {
      const {rows, cols, navCols} = indexTable(table);
      if (!cols) return;
      for (const tr of rows){
        for (let c=0;c<cols;c++){
          if (!navCols[c]) continue;
          const td = getCellAtCol(tr, c); if (!td) continue;
          const el = findEditor(td); if (!el || el.__navV2) continue;
          el.addEventListener('keydown', handleArrowKey, true); // capture phase
          el.__navV2 = true;
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindNavHandlers, { once:true });
  else bindNavHandlers();
  new MutationObserver(bindNavHandlers).observe(document.documentElement, { childList:true, subtree:true });
})();
// === end TABLE NAVIGATION v2 ===
