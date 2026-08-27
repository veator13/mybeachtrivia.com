// mybeachtrivia.com/beachTriviaPages/dashboards/admin/leads/script.js
// Leads admin (Firebase v9 COMPAT APIs, no imports).
// Assumes firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
// and firebase-init.js are loaded in index.html BEFORE this file.
//
// Data model (see /CLAUDE.md for the locked schema):
//   venues/{venueId}            durable venue identity
//   leads/{leadId}              current opportunity, 1:1 with a venue (leads.venueId)
//   leadObservations/{obsId}    dated research history (leadObservations.leadId)

const auth = firebase.auth();
const db = firebase.firestore();

/////////////////////////
// Constants
/////////////////////////
const STATUS_BUCKETS = [
  "Pitch Now",
  "Worth Investigating",
  "New-Coming Soon",
  "Former-Lapsed Service",
  "Current Competitor",
  "Poor Fit",
];

const PIPELINE_STAGES = [
  "Unreviewed",
  "Approved",
  "Packet Dropped Off",
  "Contacted",
  "Follow-Up",
  "Interested",
  "Trial Scheduled",
  "Won",
  "Lost",
];

const RESEARCH_PRIORITIES = ["high", "medium", "low"];

const BUCKET_PILL = {
  "Pitch Now": "pill-green",
  "Worth Investigating": "pill-blue",
  "New-Coming Soon": "pill-amber",
  "Former-Lapsed Service": "pill-gray",
  "Current Competitor": "pill-red",
  "Poor Fit": "pill-gray",
};

const PRIORITY_PILL = { high: "pill-red", medium: "pill-amber", low: "pill-gray" };

/////////////////////////
// Helpers
/////////////////////////
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const norm = (v) => String(v ?? "").toLowerCase().trim();

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  // Parse bare YYYY-MM-DD as local midnight, not UTC (avoids off-by-one in display).
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(v) {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// YYYY-MM-DD from a Date using local (not UTC) components — for <input type="date">.
function toDateInputValue(v) {
  const d = toDate(v);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function daysFromNow(v) {
  const d = toDate(v);
  if (!d) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

function pill(text, cls) {
  if (!text) return "—";
  return `<span class="pill ${cls || "pill-gray"}">${esc(text)}</span>`;
}

function linkOut(url, label) {
  if (!url) return "";
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label || url)}</a>`;
}

/////////////////////////
// DOM
/////////////////////////
const tableBody = document.getElementById("leadsTableBody");
const countEl = document.getElementById("leads-count");
const noResultsEl = document.getElementById("leads-no-results");
const badgeUnreviewed = document.getElementById("badge-unreviewed");

const searchInput = document.getElementById("leadSearch");
const bucketFilter = document.getElementById("bucketFilter");
const segButtons = Array.from(document.querySelectorAll(".seg-btn"));

const modal = document.getElementById("leadModal");
const modalTitle = document.getElementById("leadModalTitle");
const modalSub = document.getElementById("leadModalSub");
const quickSummaryEl = document.getElementById("leadQuickSummary");
const competitorBanner = document.getElementById("leadCompetitorBanner");
const reviewBar = document.getElementById("leadReviewBar");
const detailBody = document.getElementById("leadDetailBody");
const closeModalBtn = document.querySelector(".close-modal");
const copyLeadBtn = document.getElementById("copyLeadBtn");
const deleteLeadBtn = document.getElementById("deleteLeadBtn");

/////////////////////////
// State
/////////////////////////
let leadsCache = []; // [{id, ...leadData}]
let venuesById = new Map(); // venueId -> {id, ...venueData}
let currentView = "unreviewed"; // unreviewed | active | all
let openLeadId = null;
let openLeadReviewed = false; // reviewed state of the lead currently in the modal
let openLeadObservations = []; // observations for the lead currently in the modal

/////////////////////////
// Modal helpers
/////////////////////////
function openModal() {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  try { document.body.style.overflow = "hidden"; } catch {}
}
function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  openLeadId = null;
  if (quickSummaryEl) { quickSummaryEl.className = ""; quickSummaryEl.innerHTML = ""; }
  if (competitorBanner) { competitorBanner.className = ""; competitorBanner.innerHTML = ""; }
  try { document.body.style.overflow = ""; } catch {}
}
if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal && modal.classList.contains("is-open")) closeModal();
});
if (modal) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

/////////////////////////
// Filtering + rendering
/////////////////////////
function venueFor(lead) {
  return (lead.venueId && venuesById.get(lead.venueId)) || {};
}

function searchIndex(lead) {
  const v = venueFor(lead);
  return [
    v.name, v.city, v.neighborhood, v.address, v.venueClassification,
    lead.statusBucket, lead.pipelineStage, lead.recommendedOpportunity, lead.pitchAngle,
  ].map(norm).join(" | ");
}

function isClosed(lead) {
  return (
    lead.pipelineStage === "Won" ||
    lead.pipelineStage === "Lost" ||
    lead.statusBucket === "Poor Fit"
  );
}

function passesView(lead) {
  if (currentView === "all") return true;
  if (currentView === "unreviewed") return lead.reviewed !== true;
  if (currentView === "closed") return lead.reviewed === true && isClosed(lead);
  // active: reviewed, still in play
  return lead.reviewed === true && !isClosed(lead);
}

function sortLeads(list) {
  const prRank = { high: 0, medium: 1, low: 2 };
  return list.slice().sort((a, b) => {
    const pa = prRank[a.researchPriority] ?? 1;
    const pb = prRank[b.researchPriority] ?? 1;
    if (pa !== pb) return pa - pb;
    const sa = a.leadScore ?? -1;
    const sb = b.leadScore ?? -1;
    if (sa !== sb) return sb - sa;
    return norm(venueFor(a).name).localeCompare(norm(venueFor(b).name));
  });
}

function applyFilters() {
  const q = norm(searchInput?.value || "");
  const bucket = bucketFilter?.value || "";
  return sortLeads(
    leadsCache.filter((lead) => {
      if (!passesView(lead)) return false;
      if (bucket && lead.statusBucket !== bucket) return false;
      if (q && !searchIndex(lead).includes(q)) return false;
      return true;
    })
  );
}

function renderTable() {
  if (!tableBody) return;

  const unreviewedCount = leadsCache.filter((l) => l.reviewed !== true).length;
  if (badgeUnreviewed) badgeUnreviewed.textContent = String(unreviewedCount);

  const rows = applyFilters();
  const total = leadsCache.length;

  if (countEl) {
    countEl.textContent =
      total === rows.length
        ? `${total} lead${total === 1 ? "" : "s"}`
        : `${rows.length} of ${total} lead${total === 1 ? "" : "s"} shown`;
  }

  if (noResultsEl) {
    const show = total > 0 && rows.length === 0;
    noResultsEl.style.display = show ? "block" : "none";
    noResultsEl.textContent = show ? "No leads match the current filters." : "";
  }

  tableBody.innerHTML = rows
    .map((lead) => {
      const v = venueFor(lead);
      const reviewed = lead.reviewed === true;
      const nextDays = daysFromNow(lead.nextResearchDate);
      const nextClass = nextDays !== null && nextDays <= 0 ? "cell-due" : "";
      const opening =
        v.openingStatus === "coming_soon" || v.openingStatus === "recently_opened"
          ? `${esc(v.openingStatus.replace(/_/g, " "))}${v.openingDate ? " · " + esc(fmtDate(v.openingDate)) : ""}`
          : esc(v.openingStatus || "—");

      return `
      <tr data-id="${esc(lead.id)}" class="lead-row">
        <td class="col-venue">
          <strong>${esc(v.name || "(unknown venue)")}</strong>
          <div class="muted">${esc([v.city || v.neighborhood, v.venueClassification].filter(Boolean).join(" · ") || "—")}</div>
        </td>
        <td>${pill(lead.statusBucket, BUCKET_PILL[lead.statusBucket])}</td>
        <td class="col-num">${lead.leadScore ?? "—"}</td>
        <td>${pill(lead.researchPriority, PRIORITY_PILL[lead.researchPriority])}</td>
        <td>${esc(lead.pipelineStage || "—")}</td>
        <td>${opening || "—"}</td>
        <td class="${nextClass}">${esc(fmtDate(lead.nextResearchDate))}${
        nextDays !== null && nextDays <= 0 ? " <span class=\"muted\">(due)</span>" : ""
      }</td>
        <td>
          <span class="pill ${reviewed ? "pill-green" : "pill-amber"}">${reviewed ? "Yes" : "No"}</span>
        </td>
      </tr>`;
    })
    .join("");
}

/////////////////////////
// Detail modal
/////////////////////////
function kv(label, valueHtml) {
  return `<div class="kv"><div class="kv-k">${esc(label)}</div><div class="kv-v">${valueHtml || "—"}</div></div>`;
}

function section(title, inner) {
  return `<section class="ld-section"><h4>${esc(title)}</h4>${inner}</section>`;
}

function renderSocials(v) {
  const links = [];
  if (v.website) links.push(linkOut(v.website, "Website"));
  const s = v.socialLinks || {};
  Object.keys(s).forEach((k) => {
    if (s[k]) links.push(linkOut(s[k], k[0].toUpperCase() + k.slice(1)));
  });
  return links.length ? links.join(" &nbsp;·&nbsp; ") : "—";
}

// Normalize venue.currentEntertainment into an array of {format, host, schedule, note, isCompetitor}
const IN_HOUSE_RE = /^\s*(in.?house|venue|staff|self|bartender)/i;
function entertainmentEntries(v) {
  let raw = v && v.currentEntertainment;
  if (!raw) return [];
  if (typeof raw === "string") raw = [{ note: raw }];
  if (!Array.isArray(raw)) raw = [raw];
  return raw.map((e) => {
    const host = e.host || e.company || "";
    const isCompetitor =
      e.isCompetitor === true ||
      (e.isCompetitor !== false && !!host && !IN_HOUSE_RE.test(host));
    return {
      format: e.format || e.type || "Entertainment",
      host,
      schedule: e.schedule || e.night || e.day || "",
      note: e.note || e.finding || "",
      isCompetitor,
    };
  });
}

// Plain-text export of the open lead — for pasting into email or an AI tool.
function buildLeadText(lead, v, observations) {
  const L = [];
  const line = (k, val) => { if (val || val === 0) L.push(`${k}: ${val}`); };

  L.push(`LEAD — ${v.name || "(unknown venue)"}`);
  line("Location", [v.city || v.neighborhood, v.address].filter(Boolean).join(" · "));
  line("Status bucket", lead.statusBucket);
  line("Lead score", lead.leadScore ?? "—");
  line("Research priority", lead.researchPriority);
  line("Pipeline stage", lead.pipelineStage);
  line("Reviewed", lead.reviewed === true ? "yes" : "no");
  line("Next research date", fmtDate(lead.nextResearchDate));

  const qs = v.quickSummary || {};
  L.push("", "— QUICK SUMMARY —");
  line("Open nights", qs.openNights || qs.open_nights || "—");
  line("Competitors", qs.competitors ||
    (entertainmentEntries(v).filter((e) => e.isCompetitor).map((e) => `${e.host} (${[e.format, e.schedule].filter(Boolean).join(", ")})`).join("; ") || "None found"));
  line("Trivia / bingo history", qs.serviceHistory || qs.history || "—");

  L.push("", "— VENUE —");
  line("Address", v.address);
  line("Phone", [v.phone || "none published", v.phoneNote && `(${v.phoneNote})`].filter(Boolean).join(" "));
  line("Email", [v.email || "none found", v.emailNote && `(${v.emailNote})`].filter(Boolean).join(" "));
  line("Website", v.website);
  const socials = Object.entries(v.socialLinks || {}).map(([k, u]) => `${k}: ${u}`);
  if (socials.length) line("Social", socials.join("  "));
  line("Classification", v.venueClassification);
  line("Ownership", v.ownershipType);
  line("Decision maker", v.decisionMaker && (v.decisionMaker.name
    ? `${v.decisionMaker.name}${v.decisionMaker.role ? " — " + v.decisionMaker.role : ""}`
    : (typeof v.decisionMaker === "string" ? v.decisionMaker : "")));
  line("Hours", v.hours);
  line("Kitchen hours", v.kitchenHours);
  line("Bar / alcohol model", v.barAlcoholModel);
  line("Opening status", v.openingStatus);
  line("Opening date", v.openingDate ? `${fmtDate(v.openingDate)}${v.openingDateConfidence ? " (" + v.openingDateConfidence + ")" : ""}` : "");

  const ents = entertainmentEntries(v);
  if (ents.length) {
    L.push("", "— CURRENT ENTERTAINMENT —");
    ents.forEach((e) => {
      L.push(`• ${[e.format, e.host, e.schedule].filter(Boolean).join(" — ")} ${e.isCompetitor ? "[COMPETITOR]" : "[in-house]"}`);
      if (e.note) L.push(`  ${e.note}`);
    });
  }

  if (v.plainEnglishProfile) {
    L.push("", "— PROFILE —", v.plainEnglishProfile);
  }

  L.push("", "— RECOMMENDED PITCH —");
  line("Opportunity", lead.recommendedOpportunity);
  line("How to pitch", lead.pitchAngle);

  if (observations && observations.length) {
    L.push("", "— RESEARCH HISTORY —");
    observations.forEach((o) => {
      L.push(`[${fmtDate(o.date)}] ${o.observationType || "other"}`);
      if (o.finding) L.push(o.finding);
      const src = (o.sources || []).map((s) => s.url).filter(Boolean);
      if (src.length) L.push(`Sources: ${src.join(" | ")}`);
      L.push("");
    });
  }

  L.push(`Exported from Beach Trivia Leads · ${fmtDate(new Date())}`);
  return L.join("\n");
}

async function copyOpenLeadDetails() {
  const lead = leadsCache.find((l) => l.id === openLeadId);
  if (!lead || !copyLeadBtn) return;
  const text = buildLeadText(lead, venueFor(lead), openLeadObservations);
  const done = (ok) => {
    copyLeadBtn.textContent = ok ? "✓ Copied" : "Copy failed";
    setTimeout(() => { copyLeadBtn.textContent = "📋 Copy details"; }, 1800);
  };
  try {
    await navigator.clipboard.writeText(text);
    done(true);
  } catch {
    // Fallback for older/insecure contexts
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done(true);
    } catch {
      done(false);
    }
  }
}
if (copyLeadBtn) copyLeadBtn.addEventListener("click", copyOpenLeadDetails);

async function deleteOpenLead() {
  const lead = leadsCache.find((l) => l.id === openLeadId);
  if (!lead || !deleteLeadBtn) return;
  const v = venueFor(lead);
  const name = v.name || "this lead";
  if (!window.confirm(`Delete "${name}"?\n\nThis removes the lead, its venue record, and all research history. It cannot be undone.`)) {
    return;
  }
  deleteLeadBtn.disabled = true;
  deleteLeadBtn.textContent = "Deleting…";
  try {
    const obsSnap = await db.collection("leadObservations").where("leadId", "==", lead.id).get();
    const batch = db.batch();
    obsSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection("leads").doc(lead.id));
    if (lead.venueId) batch.delete(db.collection("venues").doc(lead.venueId));
    await batch.commit();
    closeModal();
  } catch (err) {
    console.error("Delete lead failed:", err);
    alert("Delete failed — see console.");
  } finally {
    deleteLeadBtn.disabled = false;
    deleteLeadBtn.textContent = "🗑 Delete lead";
  }
}
if (deleteLeadBtn) deleteLeadBtn.addEventListener("click", deleteOpenLead);

function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// Quick Summary card at the top of the modal: open nights, competitors, service history.
// Uses venue.quickSummary {openNights, competitors, serviceHistory} when the research
// agent provided it; otherwise derives from currentEntertainment + observations.
function renderQuickSummary(v, lead, observations) {
  if (!quickSummaryEl) return;
  const qs = v.quickSummary || {};
  const ents = entertainmentEntries(v);
  const comps = ents.filter((e) => e.isCompetitor);

  const openNights = qs.openNights || qs.open_nights || "—";

  const competitors =
    qs.competitors ||
    (comps.length
      ? comps
          .map((e) => `${e.host}${[e.format, e.schedule].filter(Boolean).length ? " (" + [e.format, e.schedule].filter(Boolean).join(", ") + ")" : ""}`)
          .join("; ")
      : lead.statusBucket === "Current Competitor"
      ? "Yes — see Research History"
      : "None found");

  let history = qs.serviceHistory || qs.history;
  if (!history) {
    const hist = (observations || []).filter((o) =>
      /trivia|bingo|competitor|grand_opening|entertainment/.test(o.observationType || "")
    );
    history = hist.length
      ? hist.map((o) => `${fmtDate(o.date)} — ${truncate(o.finding, 140)}`).join("  ·  ")
      : "None on record";
  }

  quickSummaryEl.className = "quick-summary";
  quickSummaryEl.innerHTML = `
    <div class="qs-title">Quick Summary</div>
    <div class="qs-row"><span class="qs-k">Open nights</span><span class="qs-v">${esc(openNights)}</span></div>
    <div class="qs-row"><span class="qs-k">Competitors</span><span class="qs-v">${esc(competitors)}</span></div>
    <div class="qs-row"><span class="qs-k">Trivia / bingo history</span><span class="qs-v">${esc(history)}</span></div>`;
}

function renderCompetitorBanner(v, lead) {
  if (!competitorBanner) return;
  const entries = entertainmentEntries(v);
  const competitors = entries.filter((e) => e.isCompetitor);

  if (competitors.length) {
    competitorBanner.className = "competitor-banner";
    competitorBanner.innerHTML = `
      <div class="competitor-banner-tag">⚔️ Competitor on site</div>
      <div class="competitor-banner-list">
        ${competitors
          .map(
            (e) => `<div class="competitor-line">
              <span class="competitor-host">${esc(e.host)}</span>
              <span class="competitor-meta">${esc([e.format, e.schedule].filter(Boolean).join(" · "))}</span>
            </div>`
          )
          .join("")}
      </div>`;
  } else if (lead.statusBucket === "Current Competitor") {
    competitorBanner.className = "competitor-banner is-unnamed";
    competitorBanner.innerHTML = `
      <div class="competitor-banner-tag">⚔️ Current Competitor</div>
      <div class="competitor-banner-list"><div class="competitor-meta">Host not recorded on the venue — see Research History below.</div></div>`;
  } else {
    competitorBanner.className = "";
    competitorBanner.innerHTML = "";
  }
}

function reviewBarInnerHtml() {
  if (openLeadReviewed) {
    return `
      <div class="review-bar-status"><span class="review-check">✓</span> Reviewed — off the queue</div>
      <button type="button" class="btn btn-ghost btn-sm review-toggle-btn">Move back to Unreviewed</button>`;
  }
  return `
    <div class="review-bar-copy">
      <strong>In the unreviewed queue</strong>
      <span class="muted">Mark it reviewed once you've triaged it — approved into the pipeline or set aside.</span>
    </div>
    <button type="button" class="btn-review review-toggle-btn">✓ Mark Reviewed</button>`;
}

// Renders every .js-review-bar on the page (top of modal + bottom of details)
// so they stay in sync no matter which one the user clicks.
function renderReviewBar() {
  const stateClass = openLeadReviewed ? "is-reviewed" : "is-pending";
  document.querySelectorAll(".js-review-bar").forEach((bar) => {
    bar.className = `review-bar js-review-bar ${stateClass}`;
    bar.innerHTML = reviewBarInnerHtml();
  });
  document.querySelectorAll(".review-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleReviewed(openLeadId));
  });
}

async function toggleReviewed(leadId) {
  if (!leadId) return;
  const next = !openLeadReviewed;
  document.querySelectorAll(".review-toggle-btn").forEach((b) => {
    b.disabled = true;
    b.textContent = "Saving…";
  });
  try {
    await db.collection("leads").doc(leadId).update({
      reviewed: next,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    openLeadReviewed = next;
    renderReviewBar();
  } catch (err) {
    console.error("Toggle reviewed failed:", err);
    renderReviewBar(); // restore buttons
    alert("Could not update reviewed status — see console.");
  }
}

async function openLead(leadId) {
  const lead = leadsCache.find((l) => l.id === leadId);
  if (!lead) return;
  openLeadId = leadId;
  openLeadReviewed = lead.reviewed === true;
  const v = venueFor(lead);

  modalTitle.textContent = v.name || "(unknown venue)";
  modalSub.innerHTML = [
    esc([v.city || v.neighborhood, v.address].filter(Boolean).join(" · ")),
    pill(lead.statusBucket, BUCKET_PILL[lead.statusBucket]),
  ].filter(Boolean).join(" &nbsp; ");
  renderCompetitorBanner(v, lead);
  renderReviewBar();

  detailBody.innerHTML = `<div class="muted">Loading research history…</div>`;
  openModal();

  let observations = [];
  try {
    const snap = await db.collection("leadObservations").where("leadId", "==", leadId).get();
    observations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    observations.sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
  } catch (err) {
    console.error("Failed to load observations:", err);
  }
  openLeadObservations = observations;
  renderQuickSummary(v, lead, observations);

  const phoneNoteHtml = v.phoneNote ? `<div class="muted">${esc(v.phoneNote)}</div>` : "";
  const phoneHtml = v.phone
    ? `<a href="tel:${esc(v.phone)}">${esc(v.phone)}</a>${phoneNoteHtml}`
    : (phoneNoteHtml ? `<span class="muted">none published</span>${phoneNoteHtml}` : "—");

  const emailNoteHtml = v.emailNote ? `<div class="muted">${esc(v.emailNote)}</div>` : "";
  const emailHtml = v.email
    ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>${emailNoteHtml}`
    : `<span class="muted">not found</span>${emailNoteHtml}`;

  const basic = [
    kv("Address", esc(v.address)),
    kv("Phone", phoneHtml),
    kv("Email", emailHtml),
    kv("Links", renderSocials(v)),
    kv("Classification", esc(v.venueClassification)),
    kv("Ownership", esc(v.ownershipType)),
    kv("Hours", esc(v.hours)),
    kv("Kitchen hours", esc(v.kitchenHours)),
    kv("Bar / alcohol model", esc(v.barAlcoholModel)),
    kv("Opening status", esc(v.openingStatus)),
    kv("Opening date", `${esc(fmtDate(v.openingDate))}${v.openingDateConfidence ? ` <span class="muted">(${esc(v.openingDateConfidence)})</span>` : ""}`),
    kv("Decision maker", esc(v.decisionMaker && (v.decisionMaker.name || JSON.stringify(v.decisionMaker)))),
    kv("Basic info verified", esc(fmtDate(v.basicInfoLastVerified))),
  ].join("");

  const profile = v.plainEnglishProfile
    ? `<p class="ld-prose">${esc(v.plainEnglishProfile)}</p>`
    : `<p class="muted">No profile written yet.</p>`;

  const entEntries = entertainmentEntries(v);
  const entertainmentHtml = entEntries.length
    ? `<div class="ent-list">${entEntries
        .map(
          (e) => `<div class="ent-item ${e.isCompetitor ? "is-competitor" : "is-inhouse"}">
            <div class="ent-item-head">
              <span class="ent-format">${esc(e.format)}</span>
              ${e.host ? `<span class="ent-host">${esc(e.host)}</span>` : ""}
              <span class="ent-flag">${e.isCompetitor ? "competitor" : "in-house / not a competitor"}</span>
            </div>
            ${e.schedule ? `<div class="muted">${esc(e.schedule)}</div>` : ""}
            ${e.note ? `<div class="ent-note">${esc(e.note)}</div>` : ""}
          </div>`
        )
        .join("")}</div>`
    : `<p class="muted">Nothing on record. If this venue has trivia or music bingo, add it via a research run.</p>`;

  const pitchHtml =
    lead.recommendedOpportunity || lead.pitchAngle
      ? `<div class="pitch-callout">
          ${
            lead.recommendedOpportunity
              ? `<div class="pitch-row"><span class="pitch-label">The opportunity</span><p>${esc(lead.recommendedOpportunity)}</p></div>`
              : ""
          }
          ${
            lead.pitchAngle
              ? `<div class="pitch-row"><span class="pitch-label">How to pitch it</span><p>${esc(lead.pitchAngle)}</p></div>`
              : ""
          }
        </div>`
      : `<p class="muted">No pitch written yet — needs a research run.</p>`;

  const obsHtml = observations.length
    ? observations
        .map(
          (o) => `
        <div class="obs-item">
          <div class="obs-head">
            <span class="pill pill-gray">${esc(o.observationType || "other")}</span>
            <span class="muted">${esc(fmtDate(o.date))}</span>
          </div>
          <div class="obs-finding">${esc(o.finding || "")}</div>
          ${
            Array.isArray(o.sources) && o.sources.length
              ? `<div class="obs-sources">${o.sources
                  .map((s) => linkOut(s.url, s.url))
                  .filter(Boolean)
                  .join(" · ")}</div>`
              : ""
          }
        </div>`
        )
        .join("")
    : `<p class="muted">No observations recorded yet.</p>`;

  const nextDays = daysFromNow(lead.nextResearchDate);

  const pipelineForm = `
    <form id="pipelineForm" class="ld-form">
      <div class="ld-form-grid">
        <label class="field"><span class="label">Status bucket</span>
          <select class="input" name="statusBucket">
            ${STATUS_BUCKETS.map((b) => `<option ${b === lead.statusBucket ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="label">Pipeline stage</span>
          <select class="input" name="pipelineStage">
            ${PIPELINE_STAGES.map((s) => `<option ${s === lead.pipelineStage ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="label">Research priority</span>
          <select class="input" name="researchPriority">
            ${RESEARCH_PRIORITIES.map((p) => `<option ${p === lead.researchPriority ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span class="label">Lead score (0–100)</span>
          <input class="input" type="number" name="leadScore" min="0" max="100" value="${lead.leadScore ?? ""}">
        </label>
        <label class="field"><span class="label">Next research date</span>
          <input class="input" type="date" name="nextResearchDate" value="${toDateInputValue(lead.nextResearchDate)}">
        </label>
        <label class="field"><span class="label">Lost reason (if lost)</span>
          <input class="input" type="text" name="lostReason" value="${esc(lead.lostReason || "")}">
        </label>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save pipeline changes</button>
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      </div>
      <div class="muted" id="pipelineMsg" aria-live="polite"></div>
    </form>`;

  detailBody.innerHTML = [
    section("Basic Venue Info", `<div class="kv-grid">${basic}</div>`),
    section("Current Entertainment", entertainmentHtml),
    section("Plain-English Profile", profile),
    section("Evidence / Research History", obsHtml),
    section("Recommended Pitch", pitchHtml),
    section(
      "Sales Pipeline",
      `<div class="muted" style="margin-bottom:8px;">Next research ${esc(fmtDate(lead.nextResearchDate))}${
        nextDays !== null ? ` (${nextDays <= 0 ? "due" : "in " + nextDays + "d"})` : ""
      }</div>${pipelineForm}`
    ),
    `<div class="review-bar js-review-bar"></div>`,
  ].join("");

  renderReviewBar(); // now paints both the top bar and this bottom one

  const form = document.getElementById("pipelineForm");
  form.querySelector("[data-close]").addEventListener("click", closeModal);
  form.addEventListener("submit", (e) => savePipeline(e, leadId));
}

async function savePipeline(e, leadId) {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector("#pipelineMsg");
  const fd = new FormData(form);

  const scoreRaw = String(fd.get("leadScore") || "").trim();
  const patch = {
    statusBucket: fd.get("statusBucket") || null,
    pipelineStage: fd.get("pipelineStage") || null,
    researchPriority: fd.get("researchPriority") || null,
    leadScore: scoreRaw === "" ? null : Math.max(0, Math.min(100, Number(scoreRaw))),
    nextResearchDate: fd.get("nextResearchDate") || null,
    lostReason: String(fd.get("lostReason") || "").trim() || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (msg) msg.textContent = "Saving…";
  try {
    await db.collection("leads").doc(leadId).update(patch);
    if (msg) msg.textContent = "Saved.";
    setTimeout(() => {
      if (openLeadId === leadId) closeModal();
    }, 500);
  } catch (err) {
    console.error("Save pipeline failed:", err);
    if (msg) msg.textContent = "Save failed — see console.";
  }
}

/////////////////////////
// Row + filter events
/////////////////////////
tableBody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-id]");
  if (tr) openLead(tr.dataset.id);
});

if (searchInput) searchInput.addEventListener("input", renderTable);
if (bucketFilter) bucketFilter.addEventListener("change", renderTable);
segButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    segButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
    currentView = btn.dataset.view;
    renderTable();
  });
});

/////////////////////////
// Firestore subscriptions
/////////////////////////
let unsubLeads = null;
let unsubVenues = null;

function startListeners() {
  if (unsubVenues) unsubVenues();
  unsubVenues = db.collection("venues").onSnapshot(
    (snap) => {
      const map = new Map();
      snap.forEach((doc) => map.set(doc.id, { id: doc.id, ...doc.data() }));
      venuesById = map;
      renderTable();
    },
    (err) => {
      console.error("venues listener error:", err);
    }
  );

  if (unsubLeads) unsubLeads();
  unsubLeads = db.collection("leads").onSnapshot(
    (snap) => {
      leadsCache = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderTable();
    },
    (err) => {
      console.error("leads listener error:", err);
      alert("Failed to load leads (see console).");
    }
  );
}

/////////////////////////
// Start
/////////////////////////
auth.onAuthStateChanged((user) => {
  if (!user) return; // auth-guard handles redirect
  startListeners();
});
