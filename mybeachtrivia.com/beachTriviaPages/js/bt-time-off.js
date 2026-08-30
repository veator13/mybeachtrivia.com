/* beachTriviaPages/js/bt-time-off.js
   Shared host-side time-off logic + rendering, used by both the "Manage Time
   Off" page and the lighter modal on the employee calendar.
     window.BtTimeOff = { submit, cancel, subscribeMine, renderList, wireForm, ... }

   Firestore: timeOffRequests/{id}
     { hostId, hostName, startDate, endDate (YYYY-MM-DD, inclusive, full days),
       note, status: pending|approved|denied|cancelled, insideTwoWeeks,
       submittedAt, reviewedAt, reviewedBy, reviewedByName, denialReason,
       cancelledAt, updatedAt }
   Rules: a host reads/creates/cancels only their own; cancel needs no admin
   approval and works on pending OR approved.
*/
(function () {
  "use strict";

  const COL = "timeOffRequests";
  const LEAD_DAYS = 14;

  const LEAD_WARNING =
    "Time-off requests must be submitted at least two weeks in advance. This " +
    "request falls inside that window, so approval is not guaranteed and it " +
    "may be denied. You may still submit it for admin review.";

  const STATUS_META = {
    pending:   { label: "Pending review", cls: "pending" },
    approved:  { label: "Approved", cls: "approved" },
    denied:    { label: "Denied", cls: "denied" },
    cancelled: { label: "Cancelled", cls: "cancelled" },
  };

  function db() { return firebase.firestore(); }
  function uid() {
    return (window._currentHostUID) ||
      (firebase.auth().currentUser && firebase.auth().currentUser.uid) || null;
  }
  function displayName() {
    const u = firebase.auth().currentUser;
    return window._currentHostDisplayName ||
      (u && (u.displayName || u.email)) || "Host";
  }

  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

  function todayYMD() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function ymdToDate(ymd) {
    const [y, m, d] = String(ymd).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function daysInclusive(startYMD, endYMD) {
    const ms = ymdToDate(endYMD) - ymdToDate(startYMD);
    return Math.round(ms / 86400000) + 1;
  }

  function isInsideLeadWindow(startYMD) {
    if (!YMD_RE.test(startYMD)) return false;
    const diffDays = (ymdToDate(startYMD) - ymdToDate(todayYMD())) / 86400000;
    return diffDays < LEAD_DAYS;
  }

  function formatDate(ymd) {
    if (!YMD_RE.test(ymd)) return String(ymd || "");
    return ymdToDate(ymd).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
  }

  function formatRange(startYMD, endYMD) {
    if (!endYMD || endYMD === startYMD) return formatDate(startYMD);
    const s = ymdToDate(startYMD), e = ymdToDate(endYMD);
    const md = { month: "short", day: "numeric" };
    if (s.getFullYear() === e.getFullYear()) {
      return s.toLocaleDateString("en-US", md) + " – " +
        e.toLocaleDateString("en-US", md) + ", " + e.getFullYear();
    }
    return formatDate(startYMD) + " – " + formatDate(endYMD);
  }

  function formatTs(ts) {
    if (!ts) return "";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function escHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── data ────────────────────────────────────────────────────────────────

  async function submit(input) {
    const u = uid();
    if (!u) throw new Error("You must be signed in.");

    let startDate = String((input && input.startDate) || "").trim();
    let endDate = String((input && input.endDate) || startDate).trim();
    const note = String((input && input.note) || "").trim().slice(0, 500);

    if (!YMD_RE.test(startDate)) throw new Error("Pick a start date.");
    if (!YMD_RE.test(endDate)) endDate = startDate;
    if (endDate < startDate) throw new Error("The end date is before the start date.");
    if (startDate < todayYMD()) throw new Error("That start date is in the past.");

    // Overlap guard against the host's own still-active requests.
    const mine = await db().collection(COL).where("hostId", "==", u).get();
    const clash = mine.docs.some((doc) => {
      const r = doc.data();
      if (r.status !== "pending" && r.status !== "approved") return false;
      return !(endDate < r.startDate || startDate > r.endDate);
    });
    if (clash) {
      throw new Error("You already have a time-off request covering some of those days.");
    }

    const now = firebase.firestore.FieldValue.serverTimestamp();
    await db().collection(COL).add({
      hostId: u,
      hostName: displayName(),
      startDate,
      endDate,
      note,
      status: "pending",
      insideTwoWeeks: isInsideLeadWindow(startDate),
      submittedAt: now,
      updatedAt: now,
    });
  }

  async function cancel(id) {
    const u = uid();
    if (!u || !id) throw new Error("Missing request.");
    const ref = db().collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().hostId !== u) throw new Error("That isn't your request.");
    const now = firebase.firestore.FieldValue.serverTimestamp();
    await ref.update({ status: "cancelled", cancelledAt: now, updatedAt: now });
  }

  function subscribeMine(cb) {
    const u = uid();
    if (!u) { cb([]); return function () {}; }
    return db().collection(COL)
      .where("hostId", "==", u)
      .orderBy("submittedAt", "desc")
      .onSnapshot(
        function (snap) { cb(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))); },
        function (err) { console.error("[BtTimeOff] listener failed:", err); cb([]); }
      );
  }

  // ── rendering ───────────────────────────────────────────────────────────

  function renderList(container, requests, opts) {
    opts = opts || {};
    if (!container) return;

    if (!requests || !requests.length) {
      container.innerHTML = '<p class="bt-to-empty">' +
        escHtml(opts.emptyText || "No time-off requests yet.") + "</p>";
      return;
    }

    const today = todayYMD();
    container.innerHTML = requests.map(function (r) {
      const meta = STATUS_META[r.status] || { label: r.status || "—", cls: "" };
      const n = daysInclusive(r.startDate, r.endDate);
      const cancellable = (r.status === "pending" || r.status === "approved") && r.endDate >= today;
      const insideFlag = r.insideTwoWeeks && r.status === "pending"
        ? ' · <span class="bt-to-flag">inside 2 weeks</span>' : "";
      return `<div class="bt-to-card bt-to-card--${escHtml(meta.cls)}">
        <div class="bt-to-card-top">
          <span class="bt-to-range">${escHtml(formatRange(r.startDate, r.endDate))}</span>
          <span class="bt-to-status bt-to-status--${escHtml(meta.cls)}">${escHtml(meta.label)}</span>
        </div>
        <div class="bt-to-card-sub">${n} day${n === 1 ? "" : "s"}${insideFlag}</div>
        ${r.note ? `<div class="bt-to-note">"${escHtml(r.note)}"</div>` : ""}
        ${r.status === "denied" && r.denialReason
          ? `<div class="bt-to-reason">Admin: "${escHtml(r.denialReason)}"</div>` : ""}
        ${r.submittedAt ? `<div class="bt-to-meta">Requested ${escHtml(formatTs(r.submittedAt))}</div>` : ""}
        ${cancellable
          ? `<div class="bt-to-card-actions"><button type="button" class="bt-to-cancel" data-id="${escHtml(r.id)}">Cancel request</button></div>`
          : ""}
      </div>`;
    }).join("");

    container.querySelectorAll(".bt-to-cancel").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!window.confirm("Cancel this time-off request?")) return;
        btn.disabled = true;
        btn.textContent = "Cancelling…";
        try {
          await cancel(btn.dataset.id);
        } catch (e) {
          alert(e && e.message ? e.message : "Could not cancel.");
          btn.disabled = false;
          btn.textContent = "Cancel request";
        }
      });
    });
  }

  // Wire a { start, end, note, warning, status, submitBtn } form element set.
  // Returns nothing; on successful submit, calls opts.onSubmitted().
  function wireForm(els, opts) {
    opts = opts || {};
    if (!els || !els.start || !els.submitBtn) return;

    const min = todayYMD();
    els.start.min = min;
    if (els.end) els.end.min = min;

    function syncWarning() {
      if (!els.warning) return;
      const inside = els.start.value && isInsideLeadWindow(els.start.value);
      els.warning.textContent = inside ? LEAD_WARNING : "";
      els.warning.hidden = !inside;
    }

    els.start.addEventListener("change", function () {
      if (els.end) {
        els.end.min = els.start.value || min;
        if (els.end.value && els.end.value < els.start.value) els.end.value = els.start.value;
      }
      syncWarning();
    });
    if (els.end) els.end.addEventListener("change", syncWarning);

    els.submitBtn.addEventListener("click", async function () {
      if (els.status) { els.status.textContent = ""; els.status.classList.remove("bt-to-status-msg--ok"); }
      els.submitBtn.disabled = true;
      const original = els.submitBtn.textContent;
      els.submitBtn.textContent = "Submitting…";
      try {
        await submit({
          startDate: els.start.value,
          endDate: els.end ? (els.end.value || els.start.value) : els.start.value,
          note: els.note ? els.note.value : "",
        });
        els.start.value = "";
        if (els.end) els.end.value = "";
        if (els.note) els.note.value = "";
        syncWarning();
        if (els.status) {
          els.status.textContent = "Request submitted — an admin will review it.";
          els.status.classList.add("bt-to-status-msg--ok");
        }
        if (typeof opts.onSubmitted === "function") opts.onSubmitted();
      } catch (e) {
        if (els.status) els.status.textContent = e && e.message ? e.message : "Could not submit.";
      } finally {
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = original;
      }
    });

    syncWarning();
  }

  window.BtTimeOff = {
    submit: submit,
    cancel: cancel,
    subscribeMine: subscribeMine,
    renderList: renderList,
    wireForm: wireForm,
    isInsideLeadWindow: isInsideLeadWindow,
    formatDate: formatDate,
    formatRange: formatRange,
    todayYMD: todayYMD,
    daysInclusive: daysInclusive,
    LEAD_WARNING: LEAD_WARNING,
    LEAD_DAYS: LEAD_DAYS,
  };
})();
