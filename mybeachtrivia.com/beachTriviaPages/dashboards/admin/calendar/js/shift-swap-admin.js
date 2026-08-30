/* admin/calendar/js/shift-swap-admin.js
   Admin-side shift-swap review. Reads shiftCoverageRequests directly:
     status "pending_admin" → Pending Approvals (Approve / Reject)
     status "open"          → Open Offers (informational; admin can cancel)
   Approve/Reject go through the approveShiftSwap / rejectShiftSwap Cloud
   Functions — the shift is only reassigned server-side on approval.
   The nav bell is owned by bt-nav.js (the `notifications` collection); this file
   no longer touches #bt-nav-bell-dropdown or shiftSwapNotifications.
*/
(function () {
  "use strict";

  const COVERAGE = "shiftCoverageRequests";
  const $ = (id) => document.getElementById(id);

  let _busy = false;

  const EVENT_LABELS = {
    "classic-trivia": "Classic Trivia",
    "themed-trivia": "Themed Trivia",
    "classic-bingo": "Classic Bingo",
    "music-bingo": "Music Bingo",
    "beach-feud": "Beach Feud",
  };

  function eventLabel(type) {
    return EVENT_LABELS[type] || type || "Event";
  }

  function escHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = String(dateStr).split("-").map(Number);
    if (!y || !m || !d) return String(dateStr);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
  }

  function formatTime(t) {
    if (!t) return "";
    if (/[ap]m/i.test(t)) return t;
    const parts = String(t).split(":");
    let h = parseInt(parts[0], 10);
    const min = parts[1] || "00";
    if (isNaN(h)) return String(t);
    const suffix = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${min} ${suffix}`;
  }

  function formatTimestamp(ts) {
    if (!ts) return "";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function fn(name) {
    return firebase.functions().httpsCallable(name);
  }

  function refreshCalendar() {
    try {
      if (typeof window.loadShiftsFromFirebase === "function") window.loadShiftsFromFirebase();
      else if (typeof window.renderCalendar === "function") window.renderCalendar();
    } catch (_) {}
  }

  // ── actions ──────────────────────────────────────────────────────────────

  async function approveSwap(reqId, btn) {
    if (_busy) return;
    _busy = true;
    if (btn) { btn.disabled = true; btn.textContent = "Approving…"; }
    try {
      await fn("approveShiftSwap")({ requestId: reqId });
      refreshCalendar();
      await refreshAdmin();
    } catch (err) {
      console.error("[ShiftSwapAdmin] approve failed:", err);
      alert(err && err.message ? err.message : "Could not approve this swap.");
      if (btn) { btn.disabled = false; btn.textContent = "Approve"; }
    } finally {
      _busy = false;
    }
  }

  async function confirmReject(reqId, reason, wrap) {
    if (_busy) return;
    _busy = true;
    try {
      await fn("rejectShiftSwap")({ requestId: reqId, reason: reason || "" });
      await refreshAdmin();
    } catch (err) {
      console.error("[ShiftSwapAdmin] reject failed:", err);
      alert(err && err.message ? err.message : "Could not reject this swap.");
      if (wrap) wrap.querySelectorAll("button,textarea").forEach((el) => (el.disabled = false));
    } finally {
      _busy = false;
    }
  }

  function openRejectForm(card, reqId) {
    const footer = card.querySelector(".admin-swap-card-footer");
    if (!footer || footer.querySelector(".admin-reject-form")) return;
    footer.innerHTML = `
      <div class="admin-reject-form">
        <textarea class="admin-reject-reason" rows="2" maxlength="500"
          placeholder="Reason (optional — the hosts see this)"></textarea>
        <div class="admin-reject-form-buttons">
          <button type="button" class="admin-reject-cancel">Back</button>
          <button type="button" class="admin-reject-confirm">Reject swap</button>
        </div>
      </div>`;
    const wrap = footer.querySelector(".admin-reject-form");
    wrap.querySelector(".admin-reject-cancel").addEventListener("click", () => refreshAdmin());
    wrap.querySelector(".admin-reject-confirm").addEventListener("click", () => {
      const reason = wrap.querySelector(".admin-reject-reason").value.trim();
      wrap.querySelectorAll("button,textarea").forEach((el) => (el.disabled = true));
      wrap.querySelector(".admin-reject-confirm").textContent = "Rejecting…";
      confirmReject(reqId, reason, wrap);
    });
    wrap.querySelector(".admin-reject-reason").focus();
  }

  async function cancelOpenOffer(reqId, btn) {
    if (_busy) return;
    _busy = true;
    if (btn) { btn.disabled = true; btn.textContent = "Cancelling…"; }
    try {
      await firebase.firestore().collection(COVERAGE).doc(reqId).update({
        status: "cancelled",
        resolutionNote: "Cancelled by an admin.",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await refreshAdmin();
    } catch (err) {
      console.error("[ShiftSwapAdmin] cancelOpenOffer failed:", err);
      if (btn) { btn.disabled = false; btn.textContent = "Cancel offer"; }
    } finally {
      _busy = false;
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  function offerTypeLine(r) {
    return r.offerType === "direct"
      ? `<span class="admin-swap-offer admin-swap-offer--direct">Direct switch → ${escHtml(r.targetHostName || "a host")}</span>`
      : `<span class="admin-swap-offer">Open offer</span>`;
  }

  function pendingCard(r) {
    const typeClass = escHtml(r.eventType || "");
    return `<div class="admin-swap-card ${typeClass}" data-req-id="${escHtml(r.id)}">
      <div class="admin-swap-card-header">
        <span class="coverage-type-badge ${typeClass}">${escHtml(eventLabel(r.eventType))}</span>
        <span class="admin-swap-date">${escHtml(formatDate(r.shiftDate))}</span>
      </div>
      <div class="admin-swap-card-body">
        <div class="admin-swap-time">${escHtml(formatTime(r.startTime))} – ${escHtml(formatTime(r.endTime))}</div>
        <div class="admin-swap-location">${escHtml(r.location || "")}</div>
        <div class="admin-swap-hosts">
          <span class="admin-swap-from">${escHtml(r.requestingHostName || "Unknown")}</span>
          <span class="admin-swap-arrow">→</span>
          <span class="admin-swap-to">${escHtml(r.acceptingHostName || "Unknown")}</span>
        </div>
        <div class="admin-swap-offer-line">${offerTypeLine(r)}</div>
        ${r.note ? `<div class="admin-swap-note">"${escHtml(r.note)}"</div>` : ""}
        ${r.acceptedAt ? `<div class="admin-swap-meta">Accepted ${escHtml(formatTimestamp(r.acceptedAt))}</div>` : ""}
      </div>
      <div class="admin-swap-card-footer">
        <button class="admin-approve-btn" data-req-id="${escHtml(r.id)}" type="button">Approve</button>
        <button class="admin-reject-btn" data-req-id="${escHtml(r.id)}" type="button">Reject</button>
      </div>
    </div>`;
  }

  function openOfferCard(r) {
    const typeClass = escHtml(r.eventType || "");
    return `<div class="admin-swap-card ${typeClass}" data-req-id="${escHtml(r.id)}">
      <div class="admin-swap-card-header">
        <span class="coverage-type-badge ${typeClass}">${escHtml(eventLabel(r.eventType))}</span>
        <span class="admin-swap-date">${escHtml(formatDate(r.shiftDate))}</span>
      </div>
      <div class="admin-swap-card-body">
        <div class="admin-swap-time">${escHtml(formatTime(r.startTime))} – ${escHtml(formatTime(r.endTime))}</div>
        <div class="admin-swap-location">${escHtml(r.location || "")}</div>
        <div class="admin-swap-hosts">
          <span class="admin-swap-from">${escHtml(r.requestingHostName || "Unknown")}</span>
          <span class="admin-swap-arrow">is offering this shift</span>
        </div>
        <div class="admin-swap-offer-line">${offerTypeLine(r)}</div>
        ${r.note ? `<div class="admin-swap-note">"${escHtml(r.note)}"</div>` : ""}
      </div>
      <div class="admin-swap-card-footer">
        <button class="admin-cancel-offer-btn" data-req-id="${escHtml(r.id)}" type="button">Cancel offer</button>
      </div>
    </div>`;
  }

  function section(title, cardsHtml) {
    return `<div class="admin-swap-section">
      <h3 class="admin-swap-section-title">${escHtml(title)}</h3>${cardsHtml}</div>`;
  }

  // ── time off ─────────────────────────────────────────────────────────────

  const TIMEOFF = "timeOffRequests";

  function toRange(r) {
    if (!r.endDate || r.endDate === r.startDate) return formatDate(r.startDate);
    return formatDate(r.startDate) + " – " + formatDate(r.endDate);
  }
  function toDays(r) {
    const a = String(r.startDate).split("-").map(Number);
    const b = String(r.endDate || r.startDate).split("-").map(Number);
    return Math.round((new Date(b[0], b[1] - 1, b[2]) - new Date(a[0], a[1] - 1, a[2])) / 86400000) + 1;
  }
  function empName(id) {
    return (window.employees || {})[id] || id || "Unknown";
  }
  function hostOptions(exclude) {
    const m = window.employees || {};
    return Object.keys(m)
      .filter((id) => id && id !== exclude)
      .map((id) => ({ id: id, name: m[id] || id }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function timeOffCard(r) {
    const n = toDays(r);
    const flag = r.insideTwoWeeks ? '<span class="admin-to-flag">⚠ Inside 2 weeks</span>' : "";
    return `<div class="admin-swap-card admin-to-card" data-to-id="${escHtml(r.id)}"
        data-host="${escHtml(r.hostId)}" data-start="${escHtml(r.startDate)}" data-end="${escHtml(r.endDate || r.startDate)}">
      <div class="admin-swap-card-header">
        <span class="admin-to-name">${escHtml(r.hostName || empName(r.hostId))}</span>
        ${flag}
      </div>
      <div class="admin-swap-card-body">
        <div class="admin-to-range">${escHtml(toRange(r))}</div>
        <div class="admin-swap-meta">${n} day${n === 1 ? "" : "s"}${r.submittedAt ? " · requested " + escHtml(formatTimestamp(r.submittedAt)) : ""}</div>
        ${r.note ? `<div class="admin-swap-note">"${escHtml(r.note)}"</div>` : ""}
      </div>
      <div class="admin-swap-card-footer">
        <button class="admin-to-approve-btn" type="button">Approve</button>
        <button class="admin-to-deny-btn" type="button">Deny</button>
      </div>
    </div>`;
  }

  async function approveTimeOffFlow(card) {
    if (_busy) return;
    const reqId = card.dataset.toId;
    const hostId = card.dataset.host;
    const btn = card.querySelector(".admin-to-approve-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }

    let conflicts = [];
    try {
      const snap = await firebase.firestore().collection("shifts")
        .where("employeeId", "==", hostId)
        .where("date", ">=", card.dataset.start)
        .where("date", "<=", card.dataset.end)
        .get();
      conflicts = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    } catch (e) {
      console.error("[ShiftSwapAdmin] conflict check failed:", e);
    }

    if (!conflicts.length) {
      await callApproveTimeOff(reqId, {});
      return;
    }
    renderConflictPanel(card, reqId, hostId, conflicts);
  }

  function renderConflictPanel(card, reqId, hostId, conflicts) {
    const footer = card.querySelector(".admin-swap-card-footer");
    const optionsHtml = '<option value="">— leave flagged —</option>' +
      hostOptions(hostId).map((o) => `<option value="${escHtml(o.id)}">${escHtml(o.name)}</option>`).join("");
    footer.innerHTML = `
      <div class="admin-to-conflict">
        <p class="admin-to-conflict-lead">${conflicts.length} shift${conflicts.length === 1 ? " falls" : "s fall"} inside this time off. Reassign each, or leave it flagged — flagged shifts show red on the calendar until sorted.</p>
        ${conflicts.map((s) => `
          <div class="admin-to-conflict-row">
            <span class="admin-to-conflict-shift">${escHtml(formatDate(s.date))} · ${escHtml(s.location || "")} · ${escHtml(eventLabel(s.type))}</span>
            <select class="admin-to-reassign" data-shift-id="${escHtml(s.id)}">${optionsHtml}</select>
          </div>`).join("")}
        <div class="admin-reject-form-buttons">
          <button type="button" class="admin-reject-cancel">Back</button>
          <button type="button" class="admin-to-conflict-confirm">Approve time off</button>
        </div>
      </div>`;
    footer.querySelector(".admin-reject-cancel").addEventListener("click", () => refreshAdmin());
    footer.querySelector(".admin-to-conflict-confirm").addEventListener("click", () => {
      const reassignments = {};
      footer.querySelectorAll(".admin-to-reassign").forEach((sel) => {
        if (sel.value) reassignments[sel.dataset.shiftId] = sel.value;
      });
      footer.querySelectorAll("button,select").forEach((el) => (el.disabled = true));
      footer.querySelector(".admin-to-conflict-confirm").textContent = "Approving…";
      callApproveTimeOff(reqId, reassignments);
    });
  }

  async function callApproveTimeOff(reqId, reassignments) {
    if (_busy) return;
    _busy = true;
    try {
      await fn("approveTimeOff")({ requestId: reqId, reassignments: reassignments });
      refreshCalendar();
      await refreshAdmin();
    } catch (err) {
      console.error("[ShiftSwapAdmin] approveTimeOff failed:", err);
      alert(err && err.message ? err.message : "Could not approve this time off.");
      await refreshAdmin();
    } finally {
      _busy = false;
    }
  }

  function denyTimeOffForm(card, reqId) {
    const footer = card.querySelector(".admin-swap-card-footer");
    footer.innerHTML = `
      <div class="admin-reject-form">
        <textarea class="admin-reject-reason" rows="2" maxlength="500" placeholder="Reason (optional — the host sees this)"></textarea>
        <div class="admin-reject-form-buttons">
          <button type="button" class="admin-reject-cancel">Back</button>
          <button type="button" class="admin-reject-confirm">Deny time off</button>
        </div>
      </div>`;
    footer.querySelector(".admin-reject-cancel").addEventListener("click", () => refreshAdmin());
    footer.querySelector(".admin-reject-confirm").addEventListener("click", async () => {
      if (_busy) return;
      _busy = true;
      const reason = footer.querySelector(".admin-reject-reason").value.trim();
      footer.querySelectorAll("button,textarea").forEach((el) => (el.disabled = true));
      footer.querySelector(".admin-reject-confirm").textContent = "Denying…";
      try {
        await fn("denyTimeOff")({ requestId: reqId, reason: reason });
        await refreshAdmin();
      } catch (err) {
        console.error("[ShiftSwapAdmin] denyTimeOff failed:", err);
        alert(err && err.message ? err.message : "Could not deny this request.");
        footer.querySelectorAll("button,textarea").forEach((el) => (el.disabled = false));
        footer.querySelector(".admin-reject-confirm").textContent = "Deny time off";
      } finally {
        _busy = false;
      }
    });
    footer.querySelector(".admin-reject-reason").focus();
  }

  // ── main refresh ─────────────────────────────────────────────────────────

  async function refreshAdmin() {
    const container = $("admin-shift-offers-container");
    const badge = $("admin-shift-offers-badge");
    if (container) container.innerHTML = '<p class="admin-swap-empty">Loading…</p>';

    try {
      const db = firebase.firestore();
      const [pendSnap, openSnap, toSnap] = await Promise.all([
        db.collection(COVERAGE).where("status", "==", "pending_admin").orderBy("createdAt", "desc").get(),
        db.collection(COVERAGE).where("status", "==", "open").orderBy("createdAt", "desc").get(),
        db.collection(TIMEOFF).where("status", "==", "pending").orderBy("startDate", "asc").get(),
      ]);

      let pending = pendSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      let open = openSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const timeOff = toSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Drop requests whose shift no longer exists (admin can write shift_deleted).
      const all = pending.concat(open);
      const shiftIds = [...new Set(all.map((r) => r.shiftId).filter(Boolean))];
      if (shiftIds.length) {
        const checks = await Promise.all(shiftIds.map((id) => db.collection("shifts").doc(id).get()));
        const alive = new Set(checks.filter((s) => s.exists).map((s) => s.id));
        all.forEach((r) => {
          if (r.shiftId && !alive.has(r.shiftId)) {
            db.collection(COVERAGE).doc(r.id).update({
              status: "shift_deleted",
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
          }
        });
        pending = pending.filter((r) => !r.shiftId || alive.has(r.shiftId));
        open = open.filter((r) => !r.shiftId || alive.has(r.shiftId));
      }

      const total = pending.length + open.length + timeOff.length;
      if (badge) { badge.textContent = String(total); badge.hidden = false; }
      try { window.BtNavBell?.refresh?.(); } catch (_) {}

      if (!container) return;
      if (total === 0) {
        container.innerHTML = '<p class="admin-swap-empty">No pending swaps, open offers, or time-off requests.</p>';
        return;
      }

      let html = "";
      if (timeOff.length) html += section("Time off — needs review", timeOff.map(timeOffCard).join(""));
      if (pending.length) html += section("Pending swap approvals", pending.map(pendingCard).join(""));
      if (open.length) html += section("Open offers", open.map(openOfferCard).join(""));
      container.innerHTML = html;

      container.querySelectorAll(".admin-approve-btn").forEach((b) =>
        b.addEventListener("click", () => approveSwap(b.dataset.reqId, b)));
      container.querySelectorAll(".admin-reject-btn").forEach((b) =>
        b.addEventListener("click", () => openRejectForm(b.closest(".admin-swap-card"), b.dataset.reqId)));
      container.querySelectorAll(".admin-cancel-offer-btn").forEach((b) =>
        b.addEventListener("click", () => cancelOpenOffer(b.dataset.reqId, b)));
      container.querySelectorAll(".admin-to-approve-btn").forEach((b) =>
        b.addEventListener("click", () => approveTimeOffFlow(b.closest(".admin-to-card"))));
      container.querySelectorAll(".admin-to-deny-btn").forEach((b) =>
        b.addEventListener("click", () => denyTimeOffForm(b.closest(".admin-to-card"), b.closest(".admin-to-card").dataset.toId)));
    } catch (err) {
      console.error("[ShiftSwapAdmin] refreshAdmin failed:", err);
      if (container) container.innerHTML = '<p class="admin-swap-empty">Could not load swaps.</p>';
    }
  }

  // ── wiring ───────────────────────────────────────────────────────────────

  function wire() {
    $("admin-open-shift-offers")?.addEventListener("click", () => {
      $("admin-shift-offers-modal")?.setAttribute("aria-hidden", "false");
      refreshAdmin();
    });
    $("admin-close-shift-offers")?.addEventListener("click", () => {
      $("admin-shift-offers-modal")?.setAttribute("aria-hidden", "true");
    });
    $("admin-shift-offers-modal")?.addEventListener("click", (e) => {
      if (e.target === $("admin-shift-offers-modal")) {
        $("admin-shift-offers-modal").setAttribute("aria-hidden", "true");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const m = $("admin-shift-offers-modal");
      if (m?.getAttribute("aria-hidden") === "false") m.setAttribute("aria-hidden", "true");
    });

    firebase.auth().onAuthStateChanged((user) => {
      if (user) refreshAdmin();
    });
  }

  document.addEventListener("DOMContentLoaded", wire);

  window.ShiftSwapAdmin = { refresh: refreshAdmin };
})();
