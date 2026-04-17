/* admin/calendar/js/shift-swap-admin.js
   Handles shift swap notifications for the admin calendar.
   Populates the bell dropdown and the Shift Swap Notifications modal.
*/
(function () {
  "use strict";

  const NOTIFICATIONS = "shiftSwapNotifications";
  const COVERAGE = "shiftCoverageRequests";

  const $ = (id) => document.getElementById(id);

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
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
  }

  function formatTime(t) {
    if (!t) return "";
    if (/[ap]m/i.test(t)) return t;
    const parts = t.split(":");
    let h = parseInt(parts[0], 10);
    const min = parts[1] || "00";
    const suffix = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${min} ${suffix}`;
  }

  // ── admin reject swap ─────────────────────────────────────────────────────

  async function rejectSwap(notificationId, data, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Rejecting…"; }

    try {
      const db = firebase.firestore();
      const batch = db.batch();
      const now = firebase.firestore.FieldValue.serverTimestamp();
      const adminUID = firebase.auth().currentUser?.uid || null;

      // 1. Revert shift employeeId to original host
      batch.update(db.collection("shifts").doc(data.shiftId), {
        employeeId: data.originalEmployeeId,
        updatedAt: now,
      });

      // 2. Mark coverage request as declined
      batch.update(db.collection(COVERAGE).doc(data.coverageRequestId), {
        status: "declined",
        updatedAt: now,
      });

      // 3. Mark notification as rejected
      batch.update(db.collection(NOTIFICATIONS).doc(notificationId), {
        status: "rejected",
        reviewedAt: now,
        reviewedBy: adminUID,
      });

      await batch.commit();

      // Refresh calendar if available
      try { window._refreshCalendarIfAvailable?.(); } catch (_) {}

      await refreshAdminNotifications();
    } catch (err) {
      console.error("[ShiftSwapAdmin] rejectSwap failed:", err);
      if (btn) { btn.disabled = false; btn.textContent = "Reject"; }
    }
  }

  // ── admin cancel coverage request ─────────────────────────────────────────

  async function cancelCoverageRequest(reqId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Cancelling…"; }
    try {
      await firebase.firestore().collection(COVERAGE).doc(reqId).delete();
      await refreshAdminNotifications();
    } catch (err) {
      console.error("[ShiftSwapAdmin] cancelCoverageRequest failed:", err);
      if (btn) { btn.disabled = false; btn.textContent = "Cancel Request"; }
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  function renderCoverageRequestCards(requests, container) {
    if (!container || !requests.length) return;

    const html = requests.map((r) => {
      const typeClass = escHtml(r.eventType || "");
      return `<div class="admin-swap-card ${typeClass}" data-req-id="${escHtml(r.id)}">
        <div class="admin-swap-card-header">
          <span class="coverage-type-badge ${typeClass}">${escHtml(eventLabel(r.eventType))}</span>
          <span class="admin-swap-date">${escHtml(formatDate(r.shiftDate || ""))}</span>
        </div>
        <div class="admin-swap-card-body">
          <div class="admin-swap-time">${escHtml(formatTime(r.startTime))} – ${escHtml(formatTime(r.endTime))}</div>
          <div class="admin-swap-location">${escHtml(r.location || "")}</div>
          <div class="admin-swap-hosts">
            <span class="admin-swap-from">${escHtml(r.requestingHostName || "Unknown")}</span>
            <span class="admin-swap-arrow">is seeking coverage</span>
          </div>
          ${r.note ? `<div class="admin-swap-note">"${escHtml(r.note)}"</div>` : ""}
        </div>
        <div class="admin-swap-card-footer">
          <button
            class="admin-cancel-coverage-btn"
            data-req-id="${escHtml(r.id)}"
            type="button"
          >Cancel Request</button>
        </div>
      </div>`;
    }).join("");

    const section = document.createElement("div");
    section.className = "admin-swap-section";
    section.innerHTML = `<h3 class="admin-swap-section-title">Open Coverage Requests</h3>${html}`;
    container.appendChild(section);

    section.querySelectorAll(".admin-cancel-coverage-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = btn.dataset.reqId;
        if (reqId) cancelCoverageRequest(reqId, btn);
      });
    });
  }

  function renderNotificationCards(notifications, container) {
    if (!container) return;

    if (!notifications.length) {
      // Only show "none" message if there are also no coverage requests rendered
      if (!container.querySelector(".admin-swap-section")) {
        container.innerHTML = '<p class="admin-swap-empty">No pending swap notifications.</p>';
      }
      return;
    }

    const html = notifications.map((n) => {
      const typeClass = escHtml(n.eventType || "");
      return `<div class="admin-swap-card ${typeClass}" data-notif-id="${escHtml(n.id)}">
        <div class="admin-swap-card-header">
          <span class="coverage-type-badge ${typeClass}">${escHtml(eventLabel(n.eventType))}</span>
          <span class="admin-swap-date">${escHtml(formatDate(n.shiftDate))}</span>
        </div>
        <div class="admin-swap-card-body">
          <div class="admin-swap-time">${escHtml(formatTime(n.startTime))} – ${escHtml(formatTime(n.endTime))}</div>
          <div class="admin-swap-location">${escHtml(n.location || "")}</div>
          <div class="admin-swap-hosts">
            <span class="admin-swap-from">${escHtml(n.originalEmployeeName || "Unknown")}</span>
            <span class="admin-swap-arrow">→</span>
            <span class="admin-swap-to">${escHtml(n.acceptingHostName || "Unknown")}</span>
          </div>
        </div>
        <div class="admin-swap-card-footer">
          <button
            class="admin-reject-btn"
            data-notif-id="${escHtml(n.id)}"
            type="button"
          >Reject Swap</button>
        </div>
      </div>`;
    }).join("");

    const section = document.createElement("div");
    section.className = "admin-swap-section";
    section.innerHTML = `<h3 class="admin-swap-section-title">Pending Swap Approvals</h3>${html}`;
    container.appendChild(section);

    section.querySelectorAll(".admin-reject-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const notifId = btn.dataset.notifId;
        const notif = notifications.find((n) => n.id === notifId);
        if (notifId && notif) rejectSwap(notifId, notif, btn);
      });
    });
  }

  function renderBellDropdown(notifications, dropdown) {
    if (!dropdown) return;

    if (!notifications.length) {
      dropdown.innerHTML = '<p class="bt-nav__bell-empty">No pending swap notifications.</p>';
      return;
    }

    const cardsHtml = notifications.slice(0, 5).map((n) => {
      const typeClass = escHtml(n.eventType || "");
      return `<div class="bt-nav__bell-card" data-notif-id="${escHtml(n.id)}" role="button" tabindex="0">
        <div class="bt-nav__bell-card-top">
          <span class="coverage-type-badge ${typeClass}">${escHtml(eventLabel(n.eventType))}</span>
          <span class="bt-nav__bell-card-date">${escHtml(formatDate(n.shiftDate))}</span>
        </div>
        <div class="bt-nav__bell-swap-line">
          ${escHtml(n.originalEmployeeName || "Unknown")} → ${escHtml(n.acceptingHostName || "Unknown")}
        </div>
        <div class="bt-nav__bell-card-footer">
          <span class="bt-nav__bell-card-detail">${escHtml(formatTime(n.startTime))} – ${escHtml(formatTime(n.endTime))}</span>
          <button class="bt-nav__bell-reject-btn" data-notif-id="${escHtml(n.id)}" type="button">Reject</button>
        </div>
      </div>`;
    }).join("");

    const viewAllHtml = `<div class="bt-nav__bell-view-all" id="bt-nav-bell-view-all-admin">View all notifications →</div>`;
    dropdown.innerHTML = cardsHtml + viewAllHtml;

    // Wire reject buttons in dropdown
    dropdown.querySelectorAll(".bt-nav__bell-reject-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const notifId = btn.dataset.notifId;
        const notif = notifications.find((n) => n.id === notifId);
        if (notifId && notif) rejectSwap(notifId, notif, btn);
      });
    });

    // Wire card click → open modal
    dropdown.querySelectorAll(".bt-nav__bell-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".bt-nav__bell-reject-btn")) return;
        dropdown.setAttribute("aria-hidden", "true");
        $("admin-shift-offers-modal")?.setAttribute("aria-hidden", "false");
      });
    });

    // View all
    $("bt-nav-bell-view-all-admin")?.addEventListener("click", () => {
      dropdown.setAttribute("aria-hidden", "true");
      $("admin-shift-offers-modal")?.setAttribute("aria-hidden", "false");
    });
  }

  // ── main refresh ──────────────────────────────────────────────────────────

  async function refreshAdminNotifications() {
    const container = $("admin-shift-offers-container");
    const dropdown = $("bt-nav-bell-dropdown");
    const badge = $("admin-shift-offers-badge");

    if (container) container.innerHTML = '<p class="admin-swap-empty">Loading…</p>';

    try {
      const db = firebase.firestore();

      const [swapSnap, coverageSnap] = await Promise.all([
        db.collection(NOTIFICATIONS)
          .where("status", "==", "pending_review")
          .orderBy("createdAt", "desc")
          .get(),
        db.collection(COVERAGE)
          .where("status", "==", "open")
          .orderBy("createdAt", "desc")
          .get(),
      ]);

      const notifications = swapSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      let coverageRequests = coverageSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Orphan detection: filter out requests whose shift no longer exists in Firestore
      const shiftIds = [...new Set(coverageRequests.map((r) => r.shiftId).filter(Boolean))];
      if (shiftIds.length > 0) {
        const shiftChecks = await Promise.all(
          shiftIds.map((id) => db.collection("shifts").doc(id).get())
        );
        const existingShiftIds = new Set(shiftChecks.filter((s) => s.exists).map((s) => s.id));

        // Soft-delete orphaned requests so the bell can show them grayed out
        coverageRequests
          .filter((r) => r.shiftId && !existingShiftIds.has(r.shiftId))
          .forEach((r) => {
            db.collection(COVERAGE).doc(r.id).update({
              status: "shift_deleted",
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }).catch(() => {});
          });

        coverageRequests = coverageRequests.filter(
          (r) => !r.shiftId || existingShiftIds.has(r.shiftId)
        );
      }

      const totalCount = notifications.length + coverageRequests.length;

      // Update Shift Offers button badge — always visible, shows 0 when none
      if (badge) {
        badge.textContent = totalCount;
        badge.hidden = false;
      }

      // Bell count badge is owned by BtNavBell (bt-nav.js) — refresh it
      try { window.BtNavBell?.refresh?.(); } catch (_) {}

      renderBellDropdown(notifications, dropdown);

      // Clear container, then render each section
      if (container) {
        if (totalCount === 0) {
          container.innerHTML = '<p class="admin-swap-empty">No open shift offers or pending swaps.</p>';
        } else {
          container.innerHTML = "";
          renderCoverageRequestCards(coverageRequests, container);
          renderNotificationCards(notifications, container);
        }
      }
    } catch (err) {
      console.error("[ShiftSwapAdmin] refreshAdminNotifications failed:", err);
      if (container) container.innerHTML = '<p class="admin-swap-empty">Could not load notifications.</p>';
    }
  }

  // ── wiring ────────────────────────────────────────────────────────────────

  function wire() {
    // Open modal
    $("admin-open-shift-offers")?.addEventListener("click", () => {
      $("admin-shift-offers-modal")?.setAttribute("aria-hidden", "false");
      refreshAdminNotifications();
    });

    // Close modal
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
      const modal = $("admin-shift-offers-modal");
      if (modal?.getAttribute("aria-hidden") === "false") {
        modal.setAttribute("aria-hidden", "true");
      }
    });

    // Load on auth ready
    firebase.auth().onAuthStateChanged((user) => {
      if (user) refreshAdminNotifications();
    });
  }

  document.addEventListener("DOMContentLoaded", wire);

  // Expose for external refresh (e.g. after calendar re-renders)
  window.ShiftSwapAdmin = { refresh: refreshAdminNotifications };
})();
