// Applications admin — review "Join Our Team" submissions and work the pipeline.
//
// Data: Firestore `Applications` collection (written server-side by the
// submitTeamApplication Cloud Function). Admins may read + update stage/notes
// + delete (firestore.rules).

(function () {
  "use strict";

  const STAGES = ["new", "reviewing", "interview", "offer", "hired", "rejected", "withdrawn"];
  const STAGE_LABEL = {
    new: "New",
    reviewing: "Reviewing",
    interview: "Interview",
    offer: "Offer",
    hired: "Hired",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  };
  const STAGE_PILL = {
    new: "pill-blue",
    reviewing: "pill-amber",
    interview: "pill-violet",
    offer: "pill-teal",
    hired: "pill-green",
    rejected: "pill-red",
    withdrawn: "pill-gray",
  };
  const CLOSED = ["rejected", "withdrawn"];
  const OPEN = ["new", "reviewing", "interview", "offer"]; // still needs action

  let db = null;
  let currentUserEmail = "";
  let allApps = [];
  let view = "open";
  let search = "";
  let activeId = null;

  // ── boot ────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const wait = setInterval(() => {
      if (typeof firebase !== "undefined" && firebase.firestore && firebase.apps && firebase.apps.length) {
        clearInterval(wait);
        db = firebase.firestore();
        firebase.auth().onAuthStateChanged((u) => {
          currentUserEmail = (u && u.email) || "";
        });
        wireUI();
        listen();
      }
    }, 100);
  });

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  function fmtDate(ts) {
    const ms = toMillis(ts);
    if (!ms) return "—";
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtDateTime(ts) {
    const ms = toMillis(ts);
    if (!ms) return "—";
    return new Date(ms).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  // ── data ────────────────────────────────────────────────────────────────
  function listen() {
    db.collection("Applications")
      .orderBy("submittedAt", "desc")
      .onSnapshot(
        (snap) => {
          allApps = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
          render();
          if (activeId) {
            const still = allApps.find((a) => a.id === activeId);
            if (still) fillModal(still);
          }
        },
        (err) => {
          console.error("[applications] listener failed:", err);
          $("apps-empty").style.display = "block";
          $("apps-empty").textContent = "Could not load applications (" + (err.code || err.message) + ").";
        }
      );
  }

  function stageOf(a) {
    return STAGES.includes(a.stage) ? a.stage : "new";
  }

  function matchesView(a) {
    const s = stageOf(a);
    if (view === "all") return true;
    if (view === "open") return OPEN.includes(s);
    if (view === "closed") return CLOSED.includes(s);
    return s === view;
  }

  function matchesSearch(a) {
    if (!search) return true;
    const hay = [
      a.fullName, a.email, a.phone, a.address, a.favoriteCategory, a.referralSource,
    ].join(" ").toLowerCase();
    return search.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
  }

  // ── render ──────────────────────────────────────────────────────────────
  function render() {
    const openCount = allApps.filter((a) => OPEN.includes(stageOf(a))).length;
    const newCount = allApps.filter((a) => stageOf(a) === "new").length;
    $("badge-open").textContent = openCount;
    $("badge-new").textContent = newCount;

    const rows = allApps.filter(matchesView).filter(matchesSearch);
    $("apps-count").textContent =
      rows.length + (rows.length === 1 ? " application" : " applications") +
      (view === "all" ? "" : " · " + labelForView());

    const body = $("appsTableBody");
    body.innerHTML = "";
    $("apps-empty").style.display = rows.length ? "none" : "block";
    if (!rows.length) {
      $("apps-empty").textContent = allApps.length
        ? "No applications match this filter."
        : "No applications yet.";
      return;
    }

    const frag = document.createDocumentFragment();
    rows.forEach((a) => {
      const s = stageOf(a);
      const tr = document.createElement("tr");
      tr.className = "app-row";
      tr.tabIndex = 0;
      tr.innerHTML =
        '<td class="col-name"><strong>' + esc(a.fullName || "—") + "</strong><br>" +
          '<span class="muted">' + esc(a.email || "") + "</span></td>" +
        "<td>" + esc(fmtDate(a.submittedAt)) + "</td>" +
        '<td class="cell-avail">' + esc(fmtAvail(a.availability)) + "</td>" +
        "<td>" + esc(a.shiftPreference || "—") + "</td>" +
        "<td>" + esc(travelShort(a.travelDistance)) + "</td>" +
        '<td><span class="pill ' + STAGE_PILL[s] + '">' + STAGE_LABEL[s] + "</span>" +
          (a.reviewed ? "" : ' <span class="dot-new" title="Not yet reviewed"></span>') + "</td>";
      tr.addEventListener("click", () => openModal(a.id));
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(a.id); }
      });
      frag.appendChild(tr);
    });
    body.appendChild(frag);
  }

  function labelForView() {
    if (view === "open") return "open";
    if (view === "closed") return "closed";
    return STAGE_LABEL[view] || view;
  }
  function fmtAvail(arr) {
    if (!Array.isArray(arr) || !arr.length) return "—";
    const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const abbr = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
    return arr.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => abbr[d] || d).join(", ");
  }
  function travelShort(v) {
    return ({
      under5: "<5 mi", "5to10": "5–10 mi", "10to20": "10–20 mi",
      "20to30": "20–30 mi", over30: "30+ mi",
    })[v] || v || "—";
  }

  // ── modal ───────────────────────────────────────────────────────────────
  function openModal(id) {
    const a = allApps.find((x) => x.id === id);
    if (!a) return;
    activeId = id;
    fillModal(a);
    const m = $("appModal");
    m.classList.add("is-open");
    m.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    activeId = null;
    const m = $("appModal");
    m.classList.remove("is-open");
    m.setAttribute("aria-hidden", "true");
  }

  function row(k, v) {
    if (!v) return "";
    return '<div class="kv"><div class="kv-k">' + esc(k) + '</div><div class="kv-v">' + esc(v) + "</div></div>";
  }
  function prose(k, v) {
    if (!v) return "";
    return '<div class="ld-block"><div class="kv-k">' + esc(k) + '</div><p class="ld-prose">' + esc(v) + "</p></div>";
  }

  function fillModal(a) {
    const s = stageOf(a);
    $("appModalTitle").textContent = a.fullName || "Application";
    $("appModalSub").textContent =
      "Applied " + fmtDateTime(a.submittedAt) + " · " + (a.source || "website-form");

    $("appEmailBtn").href = a.email ? "mailto:" + a.email : "#";
    $("appCallBtn").href = a.phone ? "tel:" + String(a.phone).replace(/[^\d+]/g, "") : "#";

    $("appStageSelect").value = s;
    $("appStageMsg").textContent = "";
    $("appNotes").value = a.adminNotes || "";

    $("appDetailBody").innerHTML =
      '<div class="ld-section"><h4>Contact</h4><div class="kv-grid">' +
        row("Email", a.email) + row("Phone", a.phone) + row("Address", a.address) +
      "</div></div>" +
      '<div class="ld-section"><h4>Availability &amp; logistics</h4><div class="kv-grid">' +
        row("Days", fmtAvail(a.availability)) +
        row("Shift preference", a.shiftPreference) +
        row("Will travel", travelShort(a.travelDistance)) +
        row("Reliable transport", a.transportation) +
        row("Favorite category", a.favoriteCategory) +
        row("Heard about us via", a.referralSource) +
      "</div></div>" +
      '<div class="ld-section"><h4>Experience</h4>' +
        prose("Previous experience", a.experience) +
        prose("Strongest trivia areas", a.knowledgeAreas) +
      "</div>" +
      '<div class="ld-section"><h4>Responses</h4>' +
        prose("Handling an answer dispute", a.disputeHandling) +
        prose("Handling technical difficulties", a.techIssues) +
        prose("What makes a trivia night fun", a.triviaEngagement) +
        prose("Anything else", a.additionalInfo) +
      "</div>";

    const hist = Array.isArray(a.stageHistory) ? a.stageHistory.slice() : [];
    $("appStageHistory").innerHTML = hist.length
      ? '<div class="ld-section"><h4>Stage history</h4>' +
        hist.map((h) =>
          '<div class="hist-item"><span class="pill ' + (STAGE_PILL[h.stage] || "pill-gray") + '">' +
          (STAGE_LABEL[h.stage] || h.stage) + "</span> " +
          '<span class="muted">' + esc(fmtDateTime(h.at)) + (h.by ? " · " + esc(h.by) : "") + "</span></div>"
        ).join("") + "</div>"
      : "";
  }

  async function saveStage() {
    if (!activeId) return;
    const a = allApps.find((x) => x.id === activeId);
    const next = $("appStageSelect").value;
    if (!a || next === stageOf(a)) { $("appStageMsg").textContent = "No change."; return; }
    $("appStageMsg").textContent = "Saving…";
    try {
      await db.collection("Applications").doc(activeId).update({
        stage: next,
        reviewed: next !== "new" ? true : !!a.reviewed,
        stageHistory: firebase.firestore.FieldValue.arrayUnion({
          stage: next,
          at: new Date().toISOString(),
          by: currentUserEmail || "admin",
        }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      $("appStageMsg").textContent = "Saved.";
    } catch (err) {
      console.error(err);
      $("appStageMsg").textContent = "Save failed.";
    }
  }

  async function saveNotes() {
    if (!activeId) return;
    const btn = $("appNotesSave");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await db.collection("Applications").doc(activeId).update({
        adminNotes: $("appNotes").value.slice(0, 8000),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      btn.textContent = "Saved";
    } catch (err) {
      console.error(err);
      btn.textContent = "Failed";
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = "Save notes"; }, 1500);
  }

  async function deleteApp() {
    if (!activeId) return;
    const a = allApps.find((x) => x.id === activeId);
    if (!confirm("Delete " + (a && a.fullName ? a.fullName + "'s" : "this") + " application permanently?")) return;
    try {
      await db.collection("Applications").doc(activeId).delete();
      closeModal();
    } catch (err) {
      console.error(err);
      alert("Delete failed: " + (err.message || err));
    }
  }

  function copyDetails() {
    const a = allApps.find((x) => x.id === activeId);
    if (!a) return;
    const L = [
      a.fullName, a.email, a.phone, a.address ? "Address: " + a.address : "",
      "Stage: " + STAGE_LABEL[stageOf(a)],
      "Availability: " + fmtAvail(a.availability),
      "Shift pref: " + (a.shiftPreference || "—"),
      "Will travel: " + travelShort(a.travelDistance),
      "Transport: " + (a.transportation || "—"),
      "Favorite category: " + (a.favoriteCategory || "—"),
      "Heard via: " + (a.referralSource || "—"),
      a.experience ? "\nExperience:\n" + a.experience : "",
      a.knowledgeAreas ? "\nStrong areas:\n" + a.knowledgeAreas : "",
      a.disputeHandling ? "\nDispute handling:\n" + a.disputeHandling : "",
      a.techIssues ? "\nTech difficulties:\n" + a.techIssues : "",
      a.triviaEngagement ? "\nFun trivia night:\n" + a.triviaEngagement : "",
      a.additionalInfo ? "\nAnything else:\n" + a.additionalInfo : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(L).then(
      () => { const b = $("appCopyBtn"); b.textContent = "✓ Copied"; setTimeout(() => (b.textContent = "📋 Copy details"), 1500); },
      () => alert("Copy failed")
    );
  }

  // ── UI wiring ───────────────────────────────────────────────────────────
  function wireUI() {
    document.querySelectorAll(".seg-btn").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".seg-btn").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        view = b.dataset.view;
        render();
      });
    });
    let t;
    $("appSearch").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { search = e.target.value.trim(); render(); }, 150);
    });

    $("appModal").querySelector(".close-modal").addEventListener("click", closeModal);
    $("appModal").addEventListener("click", (e) => { if (e.target === $("appModal")) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    $("appStageSave").addEventListener("click", saveStage);
    $("appNotesSave").addEventListener("click", saveNotes);
    $("appDeleteBtn").addEventListener("click", deleteApp);
    $("appCopyBtn").addEventListener("click", copyDetails);
  }
})();
