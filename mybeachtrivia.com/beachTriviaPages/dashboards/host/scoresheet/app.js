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
   BONUS input helper (first-click behavior)
======================================================= */
function bindBonusInput(inp) {
  if (!inp || inp.__bonusBound) return;
  inp.__bonusBound = true;

  // Default value
  if (!inp.value) inp.value = "0";
  if (!inp.dataset.touched) inp.dataset.touched = "0";

  // First mouse click: prevent caret from landing inside the "0", select it instead
  inp.addEventListener("mousedown", (e) => {
    if (inp.dataset.touched === "1") return; // already edited, normal behavior
    e.preventDefault();
    inp.focus();
    inp.select();
  });

  // First focus via keyboard/tab: also select the "0"
  inp.addEventListener("focus", () => {
    if (inp.dataset.touched === "1") return;
    setTimeout(() => {
      try { inp.select(); } catch (_) {}
    }, 0);
  });

  // Once the user types anything, mark as touched
  inp.addEventListener("input", () => {
    inp.dataset.touched = "1";
  });
}

/* =======================================================
   Sticky right columns (Bonus + Final Score) width & offset
======================================================= */
function updateStickyRightWidths() {
  const table = document.getElementById("teamTable");
  if (!table) {
    console.warn("[bonus+final-width] No #teamTable found");
    return;
  }

  // Representative cells
  const finalCell =
    table.querySelector("tbody td.sticky-col-right") ||
    table.querySelector("thead th.sticky-col-right");

  const bonusCell =
    table.querySelector("tbody td.bonus-col-right") ||
    table.querySelector("thead th.bonus-col-right");

  if (!finalCell || !bonusCell) {
    console.warn("[bonus+final-width] Missing .sticky-col-right or .bonus-col-right");
    return;
  }

  const finalRect = finalCell.getBoundingClientRect();
  const bonusRect = bonusCell.getBoundingClientRect();

  // Final score: a bit thinner
  const newFinalWidth = Math.max(50, Math.round(finalRect.width * 0.6));
  // Bonus: keep the narrower width we liked
  const newBonusWidth = Math.max(32, Math.round(bonusRect.width * 0.5));

  // 1) Apply column widths
  let widthStyle = document.getElementById("bonus-final-width-style");
  if (!widthStyle) {
    widthStyle = document.createElement("style");
    widthStyle.id = "bonus-final-width-style";
    document.head.appendChild(widthStyle);
  }

  widthStyle.textContent = `
    td.sticky-col-right,
    th.sticky-col-right {
      min-width: ${newFinalWidth}px;
      width: ${newFinalWidth}px;
    }

    td.bonus-col-right,
    th.bonus-col-right {
      min-width: ${newBonusWidth}px;
      width: ${newBonusWidth}px;
    }
  `;

  // 2) Make bonus inputs slightly narrower than Q1–Q20 inputs
  const sampleQInput =
    table.querySelector("tbody input[id^='num']") ||
    table.querySelector("tbody input[type='number']");
  let bonusInputWidth = 30;
  if (sampleQInput) {
    const sampleRect = sampleQInput.getBoundingClientRect();
    if (sampleRect.width) {
      // About 75% of the regular input width, but not tiny
      bonusInputWidth = Math.max(26, Math.round(sampleRect.width * 0.75));
    }
  }

  let bonusInputStyle = document.getElementById("bonus-input-tight-style");
  if (!bonusInputStyle) {
    bonusInputStyle = document.createElement("style");
    bonusInputStyle.id = "bonus-input-tight-style";
    document.head.appendChild(bonusInputStyle);
  }

  bonusInputStyle.textContent = `
    td.bonus-col-right input.bonus-input {
      width: ${bonusInputWidth}px;
    }
  `;

  // 3) Re-measure and adjust BONUS offset so it snugly touches FINAL
  requestAnimationFrame(() => {
    const finalRect2 = finalCell.getBoundingClientRect();
    const bonusRect2 = bonusCell.getBoundingClientRect();

    const gap = finalRect2.left - bonusRect2.right; // +gap = space, -gap = overlap

    const cs = getComputedStyle(bonusCell);
    let currentRight = parseFloat(cs.right);
    if (Number.isNaN(currentRight)) currentRight = 0;

    const newRight = Math.max(0, Math.round(currentRight - gap));

    let offsetStyle = document.getElementById("bonus-offset-style");
    if (!offsetStyle) {
      offsetStyle = document.createElement("style");
      offsetStyle.id = "bonus-offset-style";
      document.head.appendChild(offsetStyle);
    }

    offsetStyle.textContent = `
      td.bonus-col-right,
      th.bonus-col-right {
        right: ${newRight}px;
      }
    `;

    console.log(
      "[bonus+final-width] finalWidth:", newFinalWidth,
      "bonusWidth:", newBonusWidth,
      "gap:", gap,
      "→ bonus right:", newRight, "px",
      "bonusInputWidth:", bonusInputWidth
    );
  });
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

  const bonusCheckbox = document.createElement("input");
  bonusCheckbox.type = "checkbox";
  bonusCheckbox.id = `checkbox${teamCount}`;
  bonusCheckbox.className = "teamCheckbox";

  tdTeam.append(nameInput, bonusCheckbox);
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

  // Re-sync sticky widths after layout changes
  updateStickyRightWidths();
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

  // Row (for BONUS cell lookup)
  const row = document.querySelector(`tr[data-team-id="${teamId}"]`);

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

  // Numeric BONUS column value (>=0, blank treated as 0)
  let bonusValue = 0;
  if (row) {
    const bonusInput =
      row.querySelector("td.bonus-col-right input") ||
      row.querySelector("td.bonus-col-right input.bonus-input");
    if (bonusInput && bonusInput.value !== "") {
      const n = parseInt(bonusInput.value, 10);
      if (!isNaN(n) && n >= 0) {
        bonusValue = n;
      } else {
        bonusInput.value = "0";
        bonusValue = 0;
      }
    }
  }

  // Final score (FH + SH + BONUS)
  const finalScore = firstHalfTotal + secondHalfTotal + bonusValue;

  // Update DOM
  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
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
      li.style.background = "linear-gradient(to right, #3a3a3a, #4a4a3a)";
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

    // BONUS numeric value
    let bonusScore = 0;
    const row = document.querySelector(`tr[data-team-id="${i}"]`);
    if (row) {
      const bonusInput =
        row.querySelector("td.bonus-col-right input") ||
        row.querySelector("td.bonus-col-right input.bonus-input");
      if (bonusInput && bonusInput.value !== "") {
        const n = parseInt(bonusInput.value, 10);
        bonusScore = (!isNaN(n) && n >= 0) ? n : 0;
      }
    }

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
      bonusScore,
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

  // Also bind any BONUS inputs that may exist in static HTML (safety)
  $all("td.bonus-col-right input", table).forEach(bindBonusInput);

  // Initial sync of sticky widths
  updateStickyRightWidths();

  // Re-sync on resize/orientation changes (debounced)
  const recalcSticky = debounce(updateStickyRightWidths, 100);
  window.addEventListener("resize", recalcSticky);
  window.addEventListener("orientationchange", recalcSticky);
  window.addEventListener("load", recalcSticky);

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

    // BONUS numeric column
    if (target.classList.contains("bonus-input")) {
      dataModified = true;
      if (
        target.value !== "" &&
        (isNaN(parseInt(target.value, 10)) || parseInt(target.value, 10) < 0)
      ) {
        target.value = "0";
      }
      updateScores(teamId);
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

  // Checkbox change → recompute final score (no longer adds +5, just refresh)
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

/* =======================================================
   GRID ENFORCER / NAV / Q-SNAPS / FINAL NEG
   (your existing helper IIFEs – plus updated nav)
======================================================= */

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

// === [scoresheet][HOST] TABLE NAVIGATION V3 — capture-phase; prevents stepping; moves focus + edge-aware scroll ===
(() => {
  if (window.__HOST_TABLE_NAV_V3__) return; window.__HOST_TABLE_NAV_V3__ = 1;

  const isEditor = el => el && (el.matches?.('input, [contenteditable]') ||
                                el.querySelector?.('input, [contenteditable]'));

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
        for (let i=0;i<cs;i++){
          grid[ri][col+i] = cell;
          occ[col+i] = rs;
        }
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
    return { cols:maxCols, grid, labels };
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

  function colIndexOf(tr, td){
    let pos=0;
    for (const c of tr.cells){
      const span = Number(c.colSpan||1);
      if (c === td) return pos;
      pos += span;
    }
    return -1;
  }

  function findEditor(td){
    return td?.querySelector('input, [contenteditable]') || null;
  }

  function indexTable(table){
    const {cols, labels} = buildHeaderGrid(table);
    const rows = [];
    for (const tb of table.tBodies) for (const tr of tb.rows) rows.push(tr);

    const navCols = Array(cols).fill(false);
    const labelIsNav = (txt='') => {
      const t = txt.toLowerCase();
      return /\bq\s*\d+\b/.test(t) || /team(\s*name)?/.test(t) || /half[\s-]?time/.test(t) || /\bfinal\b/.test(t);
    };
    for (let c=0;c<cols;c++){
      if (labelIsNav(labels[c])) { navCols[c] = true; continue; }
      for (let r=0;r<rows.length; r++){
        const td = getCellAtCol(rows[r], c);
        if (td && isEditor(td)) { navCols[c] = true; break; }
      }
    }
    return { rows, cols, navCols };
  }

  // NEW: edge-aware scroll that accounts for sticky Team / Bonus / Final columns
  function ensureEditorVisible(editor) {
    if (!editor) return;

    const cell = editor.closest('td,th') || editor;
    const wrapper =
      cell.closest('.table-wrapper') ||
      document.querySelector('.table-wrapper');
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const table = wrapper.querySelector('table');

    // Sticky left (Team Name)
    let leftStickyWidth = 0;
    if (table) {
      const leftSticky = table.querySelector('thead .sticky-col');
      if (leftSticky) {
        leftStickyWidth = leftSticky.getBoundingClientRect().width;
      }
    }

    // Sticky right (Bonus + Final Score)
    let rightStickyWidth = 0;
    if (table) {
      const finalSticky = table.querySelector('thead .sticky-col-right');
      const bonusSticky = table.querySelector('thead .bonus-col-right');
      if (bonusSticky) rightStickyWidth += bonusSticky.getBoundingClientRect().width;
      if (finalSticky) rightStickyWidth += finalSticky.getBoundingClientRect().width;
    }

    // Sticky header height
    let headerHeight = 0;
    if (table && table.tHead) {
      const theadRect = table.tHead.getBoundingClientRect();
      headerHeight = theadRect.height || 0;
    }

    const cellRect = cell.getBoundingClientRect();

    // “About to leave” margins so we scroll a bit *before* the cell disappears
    const marginX = 32;
    const marginY = 12;

    const effectiveLeft   = wrapperRect.left + leftStickyWidth  + marginX;
    const effectiveRight  = wrapperRect.right - rightStickyWidth - marginX;
    const effectiveTop    = wrapperRect.top + headerHeight + marginY;
    const effectiveBottom = wrapperRect.bottom - marginY;

    // Horizontal: keep cell between sticky Team and sticky Bonus/Final
    if (cellRect.right > effectiveRight) {
      const delta = cellRect.right - effectiveRight;
      wrapper.scrollLeft += delta;
    } else if (cellRect.left < effectiveLeft) {
      const delta = effectiveLeft - cellRect.left;
      wrapper.scrollLeft -= delta;
    }

    // Vertical: keep cell below sticky header and above bottom edge
    if (cellRect.bottom > effectiveBottom) {
      const deltaY = cellRect.bottom - effectiveBottom;
      wrapper.scrollTop += deltaY;
    } else if (cellRect.top < effectiveTop) {
      const deltaY = effectiveTop - cellRect.top;
      wrapper.scrollTop -= deltaY;
    }
  }

  function moveFocus(fromEditor, dx, dy){
    const table = fromEditor.closest('table'); if (!table) return;
    const {rows, cols, navCols} = indexTable(table);
    const fromTd = fromEditor.closest('td,th'); if (!fromTd) return;
    const fromTr = fromTd.parentElement;
    const rIdx = rows.indexOf(fromTr);
    let cIdx = colIndexOf(fromTr, fromTd);
    if (rIdx < 0 || cIdx < 0) return;

    // Horizontal: prev/next navigable column (no wrap)
    if (dx) {
      let step = dx > 0 ? 1 : -1;
      let c = cIdx + step;
      while (c >= 0 && c < cols && !navCols[c]) c += step;
      if (c >= 0 && c < cols && navCols[c]) cIdx = c;
    }

    // Vertical: same column, clamp to table
    const rTarget = Math.max(0, Math.min(rows.length - 1, rIdx + (dy||0)));

    const targetTr = rows[rTarget];
    const targetTd = getCellAtCol(targetTr, cIdx);
    const targetEl = findEditor(targetTd);
    if (targetEl) {
      ensureEditorVisible(targetEl);
      targetEl.focus();
      targetEl.select?.();
    }
  }

  const ARROWS = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  function onKey(e){
    if (!ARROWS.has(e.key)) return;
    const t = e.target;
    if (!t.closest('table') || !isEditor(t)) return;

    // Kill native number-input stepping & caret moves
    e.preventDefault();
    e.stopImmediatePropagation();

    const dx = (e.key==='ArrowRight') ? 1 : (e.key==='ArrowLeft') ? -1 : 0;
    const dy = (e.key==='ArrowDown')  ? 1 : (e.key==='ArrowUp')    ? -1 : 0;
    moveFocus(t, dx, dy);
  }

  // Capture-phase so we beat native stepping and any other handlers
  document.addEventListener('keydown', onKey, true);
})();
// === end TABLE NAVIGATION V3 ===

// === [scoresheet][HOST] FINAL column — allow negative numbers ===
(() => {
  if (window.__HOST_FINAL_NEG__) return; window.__HOST_FINAL_NEG__ = 1;

  function buildHeaderGrid(table){
    const thead = table.tHead; if (!thead) return {cols:0, labels:[]};
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
        for (let i=0;i<cs;i++){
          grid[ri][col+i] = cell;
          occ[col+i] = rs;
        }
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
    return { cols:maxCols, labels };
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
  const findEditor = (td) => td?.querySelector('input, [contenteditable="true"], [contenteditable=""]') || null;

  function bindFinalEditor(el){
    if (el.__finalNegBound) return;
    el.__finalNegBound = true;

    const sanitize = () => {
      let s = (el.tagName === 'INPUT' ? el.value : el.textContent) ?? '';
      // keep only digits and a single leading '-'
      s = String(s).replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
      if (s === '' || s === '-') return;      // allow temp empty/just '-'
      const n = Number(s);
      if (el.tagName === 'INPUT') el.value = String(n);
      else el.textContent = String(n);
    };

    if (el.tagName === 'INPUT') {
      el.removeAttribute('min');              // allow negatives
      el.setAttribute('step', '1');
      el.setAttribute('inputmode', 'numeric');
      el.setAttribute('pattern', '-?[0-9]*');
      // block e/E/+/. but NOT '-'
      el.addEventListener('keydown', (e)=>{ if (['e','E','+','.'].includes(e.key)) e.preventDefault(); }, true);
      el.addEventListener('input', sanitize, { passive:true });
      el.addEventListener('change', sanitize);
      el.addEventListener('blur', () => { const v = el.value; if (v === '' || v === '-') el.value = '0'; });
    } else {
      el.setAttribute('contenteditable','true');
      el.addEventListener('keydown', (e)=>{ if (['e','E','+','.'].includes(e.key)) e.preventDefault(); }, true);
      el.addEventListener('input', sanitize);
      el.addEventListener('blur', () => { const v = el.textContent||''; if (v === '' || v === '-') el.textContent = '0'; });
    }
    // normalize once
    sanitize();
  }

  function run(){
    document.querySelectorAll('table').forEach(table => {
      const {cols, labels} = buildHeaderGrid(table);
      if (!cols) return;

      const isFinalCol = (lbl='') => /\bfinal\b/i.test(lbl);
      for (const tb of table.tBodies) {
        for (const tr of tb.rows) {
          for (let c=0;c<cols;c++){
            if (!isFinalCol(labels[c])) continue;
            const td = getCellAtCol(tr, c);
            const el = findEditor(td);
            if (el) bindFinalEditor(el);
          }
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true });
  else run();
  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();
// === end FINAL column negatives ===

// === FINAL NEGATIVE (safe, instance hook) ===
(() => {
  if (window.__HOST_FINAL_NEG_SAFE__) return; window.__HOST_FINAL_NEG_SAFE__ = 1;

  function bind(el){
    if (!el || el.__finalNegBound) return;
    el.__finalNegBound = true;

    // allow negatives at HTML level
    el.removeAttribute('min');
    el.step = '1';
    el.inputMode = 'numeric';
    el.setAttribute('pattern','-?[0-9]*');

    // hook this element's value property (instance-level)
    const proto = Object.getPrototypeOf(el);
    const desc  = Object.getOwnPropertyDescriptor(proto, 'value');
    const get   = desc.get.bind(el);
    const set   = desc.set.bind(el);

    if (!el.__negHooked) {
      Object.defineProperty(el, 'value', {
        configurable: true,
        get() { return get(); },
        set(v) {
          if (this.__negReentry) return set(v);
          if (this.__negWant && String(v) !== this.__negWant) {
            this.__negReentry = true; set(this.__negWant); this.__negReentry = false; return;
          }
          set(v);
        }
      });
      el.__negHooked = true;
    }

    const normalize = () => {
      let s = String(get() ?? '');
      s = s.replace(/[^\d-]/g,'').replace(/(?!^)-/g,'');     // digits + single leading '-'
      if (s === '' || s === '-') { el.__negWant = s; return; } // transient '-'
      const n = String(Number(s));                            // canonical int
      el.__negWant = n.startsWith('-') ? n : '';              // remember only negatives
      if (get() !== n) { el.__negReentry = true; set(n); el.__negReentry = false; }
    };

    el.addEventListener('keydown', e => {
      if (['e','E','+','.'].includes(e.key)) e.preventDefault(); // block sci/plus/decimal
      if (e.key === '-') el.__negWant = '-';
    }, true);

    el.addEventListener('input',  e => { if (!e.isTrusted) return; normalize(); }, true);
    const finish = () => { normalize(); const v=get(); if (v==='' || v==='-'){ el.__negWant=''; el.__negReentry=true; set('0'); el.__negReentry=false; } };
    el.addEventListener('change', e => { if (!e.isTrusted) return; finish(); }, true);
    el.addEventListener('blur',   e => { if (!e.isTrusted) return; finish(); }, true);
  }

  // bind current and future Final Question inputs
  const run = () => document.querySelectorAll('input.finalquestion-input').forEach(bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true }); else run();
  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();
// === end FINAL NEGATIVE (safe, instance hook) ===

// === [scoresheet][HOST] Q-COLUMN NORMALIZER & STRICT SNAPPING ===
(() => {
  if (window.__HOST_QCELL_STRICT__) return; window.__HOST_QCELL_STRICT__ = 1;

  function buildHeaderGrid(table){
    const thead = table.tHead; if (!thead) return {cols:0, labels:[]};
    const rows=[...thead.rows]; let max=0;
    rows.forEach(r => { let s=0; for (const c of r.cells) s += Number(c.colSpan||1); max=Math.max(max,s); });
    const occ=Array(max).fill(0), grid=rows.map(()=>Array(max).fill(null));
    rows.forEach((r,ri)=>{ let c=0; for (const cell of r.cells){
      while (occ[c]>0) c++; const cs=+cell.colSpan||1, rs=+cell.rowSpan||1;
      for (let i=0;i<cs;i++){ grid[ri][c+i]=cell; occ[c+i]=rs; } c+=cs;
    } for (let i=0;i<max;i++) if(occ[i]>0) occ[i]--; });

    const labels=Array(max).fill(null);
    for (let c=0;c<max;c++){ let t=''; for (let r=0;r<grid.length;r++){
      const s=(grid[r][c]?.textContent||'').trim(); if (s) t=s;
    } labels[c]=t; }
    return { cols:max, labels, grid };
  }

  function getCellColIndex(tr, td){
    let pos=0; for (const c of tr.cells){ const span=+c.colSpan||1; if (c===td) return pos; pos+=span; } return -1;
  }
  function labelForCol(table, col){
    const {labels} = buildHeaderGrid(table); return labels[col] || '';
  }
  function qNumberFromLabel(lbl){
    const m = lbl.match(/\bQ\s*([0-9]{1,2})\b/i); return m ? +m[1] : null;
  }
  function weightForQ(q){
    if (q>=1 && q<=5) return 1;
    if (q>=6 && q<=10) return 2;
    if (q>=11 && q<=15) return 3;
    if (q>=16 && q<=20) return 4;
    return null;
  }

  function bindIfQInput(el){
    const td = el.closest('td,th'); if (!td) return;
    const tr = td.parentElement; const table = tr?.closest('table'); if (!table) return;
    const col = getCellColIndex(tr, td); if (col < 0) return;
    const lbl = labelForCol(table, col);
    const q   = qNumberFromLabel(lbl);
    if (q == null) return;                  // skip non-Q columns (Final/Halftime/etc.)
    const weight = weightForQ(q); if (weight == null) return;

    // Normalize attributes so browser doesn't clamp (e.g., max="1")
    el.removeAttribute('max');
    el.setAttribute('min',  '0');
    el.setAttribute('step', '1');
    el.setAttribute('inputmode','numeric');
    el.setAttribute('pattern','[0-9]*');

    const snap = () => {
      let s = String(el.value ?? '');
      s = s.replace(/[^\d]/g,'');           // digits only for Q-cells
      if (s === '') {                       // empty -> 0
        if (el.value !== '0') el.value = '0';
        return;
      }
      const n = Number(s);
      const out = (n === 0) ? '0' : String(weight);
      if (el.value !== out) {
        el.value = out;
        // bubble input so totals refresh even if value visually unchanged
        el.dispatchEvent(new Event('input', { bubbles:true }));
      }
    };

    // Capture-phase ensures we override any stray handlers
    el.addEventListener('input',  e => { if (!e.isTrusted) return; snap(); }, true);
    el.addEventListener('change', e => { if (!e.isTrusted) return; snap(); }, true);
    el.addEventListener('blur',   e => { if (!e.isTrusted) return; snap(); }, true);
  }

  const run = () => {
    document.querySelectorAll('table tbody input[type="number"]').forEach(bindIfQInput);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once:true });
  else run();
  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();
// === end Q-COLUMN NORMALIZER & STRICT SNAPPING ===

// === [scoresheet][HOST] Q11–Q15 STRICT (0 or 3) — removes browser max clamp & blocks script-forced "1" ===
(() => {
  if (window.__HOST_Q11_15_STRICT__) return; window.__HOST_Q11_15_STRICT__ = 1;

  function buildHeaderGrid(table){
    const thead = table.tHead; if (!thead) return {cols:0, labels:[]};
    const rows = Array.from(thead.rows); let max = 0;
    rows.forEach(r => { let s=0; for (const c of r.cells) s += Number(c.colSpan||1); max=Math.max(max,s); });
    const occ = Array(max).fill(0), grid = rows.map(()=>Array(max).fill(null));
    rows.forEach((r,ri) => {
      let c=0; for (const cell of r.cells){
        while (occ[c]>0) c++; const cs=+cell.colSpan||1, rs=+cell.rowSpan||1;
        for (let i=0;i<cs;i++){ grid[ri][c+i]=cell; occ[c+i]=rs; } c+=cs;
      }
      for (let i=0;i<max;i++) if(occ[i]>0) occ[i]--;
    });
    const labels = Array(max).fill(null);
    for (let c=0;c<max;c++){ let t=''; for (let r=0;r<grid.length;r++){
      const s=(grid[r][c]?.textContent||'').trim(); if (s) t=s;
    } labels[c]=t; }
    return { cols:max, labels };
  }
  function getCellAtCol(tr, colIndex){
    let pos=0; for (const td of tr.cells){ const span=+td.colSpan||1; if (colIndex>=pos && colIndex<pos+span) return td; pos+=span; }
    return null;
  }

  function collectQ11to15Inputs(table){
    const {labels} = buildHeaderGrid(table);
    const qToCol = {};
    labels.forEach((L,i)=>{ const m = /\bQ\s*([0-9]{1,2})\b/i.exec(L||''); if (m) qToCol[+m[1]] = i; });
    const out = [];
    [11,12,13,14,15].forEach(q=>{
      const col = qToCol[q]; if (col==null) return;
      for (const tb of table.tBodies) for (const tr of tb.rows){
        const td = getCellAtCol(tr,col); if (!td) continue;
        const el = td.querySelector('input[type=number]'); if (el) out.push(el);
      }
    });
    return out;
  }

  const bound = new WeakSet();
  const unbinds = [];
  function bind(el){
    if (!el || bound.has(el)) return; bound.add(el);

    // remove legacy clamps & keep numeric-only
    el.removeAttribute('max'); el.min='0'; el.step='1'; el.inputMode='numeric'; el.setAttribute('pattern','[0-9]*');

    // no e/E/+/. (do NOT block arrows)
    const onKey = e => { if (['e','E','+','.'].includes(e.key)) e.preventDefault(); };
    el.addEventListener('keydown', onKey, true); unbinds.push(()=>el.removeEventListener('keydown', onKey, true));

    // snapper: non-zero => "3"
    const snap = () => {
      let s = String(el.value ?? '').replace(/[^\d]/g,'');
      const out = (s === '' || Number(s) === 0) ? '0' : '3';
      if (el.value !== out) { el.value = out; el.dispatchEvent(new Event('input', { bubbles:true })); }
    };
    const onInput  = e => { if (e.isTrusted) snap(); };
    const onChange = e => { if (e.isTrusted) snap(); };
    const onBlur   = e => { if (e.isTrusted) snap(); };
    el.addEventListener('input', onInput, true);
    el.addEventListener('change', onChange, true);
    el.addEventListener('blur', onBlur, true);
    unbinds.push(()=>{ el.removeEventListener('input',onInput,true); el.removeEventListener('change',onChange,true); el.removeEventListener('blur',onBlur,true); });

    // hard guard: if any script tries to set "1", coerce to "3" (unless '', '0', '3')
    const proto = Object.getPrototypeOf(el);
    const d = Object.getOwnPropertyDescriptor(proto,'value');
    if (d?.set && !el.__q315Hook) {
      const get = d.get.bind(el), set = d.set.bind(el);
      Object.defineProperty(el,'value',{ configurable:true,
        get(){ return get(); },
        set(v){
          if (this.__q315Re) return set(v);
          const str = String(v);
          if (str !== '' && str !== '0' && str !== '3') { this.__q315Re = true; set('3'); this.__q315Re = false; return; }
          set(v);
        }
      });
      el.__q315Hook = true;
    }
  }

  function apply(){
    const table = document.querySelector('table'); if (!table) return;
    collectQ11to15Inputs(table).forEach(bind);
  }

  apply();
  const mo = new MutationObserver(apply);
  mo.observe(document.documentElement, { childList:true, subtree:true });

  window.__HOST_Q11_15_STRICT_CLEANUP__ = () => { mo.disconnect(); unbinds.forEach(fn=>fn()); };
})();
// === end Q11–Q15 STRICT ===

// === [scoresheet][HOST] Q11–Q20 PRIORITY CAPTURE SNAP — no flicker, stops other handlers ===
(() => {
  if (window.__HOST_Q_PRIORITY_CAPTURE__) return; window.__HOST_Q_PRIORITY_CAPTURE__ = 1;

  function buildHeaderGrid(table){
    const thead = table.tHead; if (!thead) return {labels:[]};
    const rows = Array.from(thead.rows); let max=0;
    rows.forEach(r=>{ let s=0; for(const c of r.cells) s += Number(c.colSpan||1); max=Math.max(max,s); });
    const occ = Array(max).fill(0), grid = rows.map(()=>Array(max).fill(null));
    rows.forEach((r,ri)=>{ let c=0; for (const cell of r.cells){
      while(occ[c]>0) c++; const cs=+cell.colSpan||1, rs=+cell.rowSpan||1;
      for(let i=0;i<cs;i++){ grid[ri][c+i]=cell; occ[c+i]=rs; } c+=cs;
    } for(let i=0;i<max;i++) if(occ[i]>0) occ[i]--; });
    const labels = Array(max).fill(null);
    for (let c=0;c<max;c++){ let t=''; for (let r=0;r<grid.length;r++){
      const s=(grid[r][c]?.textContent||'').trim(); if (s) t=s;
    } labels[c]=t; }
    return {labels, grid};
  }
  function getCellAtCol(tr, colIndex){
    let pos=0; for (const td of tr.cells){ const span=+td.colSpan||1; if (colIndex>=pos && colIndex<pos+span) return td; pos+=span; }
    return null;
  }
  function collectInputs(table, qs){
    const {labels} = buildHeaderGrid(table);
    const qToCol={}; labels.forEach((L,i)=>{ const m=/\bQ\s*([0-9]{1,2})\b/i.exec(L||''); if(m) qToCol[+m[1]]=i; });
    const out=[];
    qs.forEach(q=>{
      const col=qToCol[q]; if(col==null) return;
      for (const tb of table.tBodies) for (const tr of tb.rows){
        const td=getCellAtCol(tr,col); if(!td) continue;
        const el=td.querySelector('input[type=number], [contenteditable]');
        if (el) out.push(el);
      }
    });
    return out;
  }

  function bindSnap(el, weight){
    // normalize attributes so native number input doesn’t interfere
    if (el.tagName === 'INPUT') {
      el.removeAttribute('max');
      el.setAttribute('min','0');
      el.setAttribute('step','1');
      el.setAttribute('inputmode','numeric');
      el.setAttribute('pattern','[0-9]*');
    }

    // compute -> {0, weight}
    const compute = () => {
      const raw = el.tagName === 'INPUT' ? (el.value ?? '') : (el.textContent ?? '');
      const s = String(raw).replace(/[^\d]/g,'');
      const out = (s === '' || Number(s) === 0) ? '0' : String(weight);
      return out;
    };

    // CAPTURE-PHASE: stop other handlers, apply immediately, then bubble a synthetic 'input'
    const onInputCap = (e) => {
      if (!e.isTrusted) return;           // ignore our synthetic event later
      e.stopImmediatePropagation();       // prevent older wrong handlers (e.g., 2) from firing
      const out = compute();
      if (el.tagName === 'INPUT') { if (el.value !== out) el.value = out; }
      else { if (el.textContent !== out) el.textContent = out; }
      el.dispatchEvent(new Event('input', { bubbles:true })); // keep totals reactive
    };

    const onChangeCap = (e) => { if (!e.isTrusted) return; e.stopImmediatePropagation(); onInputCap(e); };
    const onBlurCap   = (e) => { if (!e.isTrusted) return; onInputCap(e); };

    el.addEventListener('input',  onInputCap,  true);
    el.addEventListener('change', onChangeCap, true);
    el.addEventListener('blur',   onBlurCap,   true);
  }

  function apply(){
    const table = document.querySelector('table'); if (!table) return;
    collectInputs(table, [11,12,13,14,15]).forEach(el => bindSnap(el, 3));
    collectInputs(table, [16,17,18,19,20]).forEach(el => bindSnap(el, 4));
  }

  apply();
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
})();
// === end Q11–Q20 PRIORITY CAPTURE SNAP ===

// === Q16–Q20 HARD SNAP (0 or 4) — no flicker, blocks late writes ===
(() => {
  if (window.__q16_20_hardsnap__) { console.log('[q16–20 snap] already active'); return; }
  window.__q16_20_hardsnap__ = 1;

  const BOUND = new WeakSet();

  function buildHeaderGrid(table){
    const thead = table.tHead; if (!thead) return {labels:[]};
    const rows=[...thead.rows]; let max=0;
    rows.forEach(r=>{ let s=0; for (const c of r.cells) s += +c.colSpan||1; max=Math.max(max,s); });
    const occ=Array(max).fill(0), grid=rows.map(()=>Array(max).fill(null));
    rows.forEach((r,ri)=>{ let c=0; for (const cell of r.cells){
      while (occ[c]>0) c++; const cs=+cell.colSpan||1, rs=+cell.rowSpan||1;
      for (let i=0;i<cs;i++){ grid[ri][c+i]=cell; occ[c+i]=rs; } c+=cs;
    } for(let i=0;i<max;i++) if(occ[i]>0) occ[i]--; });
    const labels=Array(max).fill(null);
    for (let c=0;c<max;c++){ let t=''; for (let r=0;r<grid.length;r++){
      const s=(grid[r][c]?.textContent||'').trim(); if (s) t=s;
    } labels[c]=t; }
    return {labels};
  }
  function getCellAtCol(tr, colIndex){
    let pos=0; for (const td of tr.cells){ const span=+td.colSpan||1; if (colIndex>=pos && colIndex<pos+span) return td; pos+=span; }
    return null;
  }
  function collectQInputs(){
    const table=document.querySelector('table'); if(!table) return [];
    const {labels}=buildHeaderGrid(table);
    const qToCol={}; labels.forEach((L,i)=>{ const m=/\bQ\s*([0-9]{1,2})\b/i.exec(L||''); if(m) qToCol[+m[1]]=i; });
    const out=[];
    [16,17,18,19,20].forEach(q=>{
      const col=qToCol[q]; if(col==null) return;
      for (const tb of table.tBodies) for (const tr of tb.rows){
        const td=getCellAtCol(tr,col); if(!td) continue;
        const el=td.querySelector('input[type=number]'); if(el) out.push(el);
      }
    });
    return out;
  }

  function snapValue(el){
    const s = String(el.value ?? '').replace(/[^\d]/g,'');
    return (s === '' || Number(s) === 0) ? '0' : '4';
  }

  function bind(el){
    if (!el || BOUND.has(el)) return; BOUND.add(el);

    el.removeAttribute('max');
    el.min = '0'; el.step = '1';
    el.setAttribute('inputmode','numeric'); el.setAttribute('pattern','[0-9]*');

    const proto = Object.getPrototypeOf(el);
    if (!el.__origStepUp && proto.stepUp) {
      el.__origStepUp = proto.stepUp.bind(el);
      el.stepUp = function(){ this.value = snapValue(this); this.dispatchEvent(new Event('input',{bubbles:true})); };
    }
    if (!el.__origStepDown && proto.stepDown) {
      el.__origStepDown = proto.stepDown.bind(el);
      el.stepDown = function(){ this.value = snapValue(this); this.dispatchEvent(new Event('input',{bubbles:true})); };
    }

    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set && !el.__q1640SetterHook) {
      const get = desc.get.bind(el), set = desc.set.bind(el);
      Object.defineProperty(el, 'value', {
        configurable: true,
        get(){ return get(); },
        set(v){
          if (this.__q1640Re) return set(v);
          const s = String(v);
          const out = (s === '' || s === '0') ? '0' : '4';
          this.__q1640Re = true; set(out); this.__q1640Re = false;
        }
      });
      el.__q1640SetterHook = true;
    }

    const apply = () => {
      const out = snapValue(el);
      if (el.value !== out) { el.value = out; }
      el.dispatchEvent(new Event('input', { bubbles:true }));
    };
    const onBefore = e => { if (!e.isTrusted) return; e.stopImmediatePropagation(); };
    const onInput  = e => { if (!e.isTrusted) return; e.stopImmediatePropagation(); apply(); };
    const onChange = e => { if (!e.isTrusted) return; e.stopImmediatePropagation(); apply(); };

    el.addEventListener('beforeinput', onBefore, true);
    el.addEventListener('input',      onInput,  true);
    el.addEventListener('change',     onChange, true);

    const fixAsync = () => { setTimeout(()=>{ const out = snapValue(el); if (el.value !== out) { el.value = out; el.dispatchEvent(new Event('input',{bubbles:true})); } }, 0); };
    el.addEventListener('keyup',   fixAsync, true);
    el.addEventListener('keydown', fixAsync, true);
  }

  function applyAll(){
    const inputs = collectQInputs();
    inputs.forEach(bind);
    console.log(`[q16–20 snap] bound ${inputs.length} inputs`);
  }

  applyAll();
  new MutationObserver(applyAll).observe(document.documentElement, { childList:true, subtree:true });
  console.log('[q16–20 snap] ACTIVE — type “9” in Q18: should render 4 instantly (no 2 flicker).');
})();