/* mybeachtrivia.com/beachTriviaPages/dashboards/host/employee-calendar/js/shift-trade-requests.js */
(function () {
  "use strict";

  const COLLECTION = "shiftCoverageRequests";
  const NOTIFICATIONS = "shiftSwapNotifications";

  const _myActiveShiftIds = new Set();
  let _liveUnsub = null;
  let _allRequestsCache = [];
  let _currentFilter = "active"; // active | cancelled

  const $ = (id) => document.getElementById(id);

  function currentUID() {
    return (
      window._currentHostUID ||
      firebase.auth().currentUser?.uid ||
      null
    );
  }

  function currentDisplayName() {
    return (
      window._currentHostDisplayName ||
      firebase.auth().currentUser?.displayName ||
      firebase.auth().currentUser?.email ||
      "Unknown Host"
    );
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
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

  function formatTimestamp(ts) {
    if (!ts) return "";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }) + " at " + d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

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

  function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    const d = new Date(ts);
    return isNaN(d) ? 0 : d.getTime();
  }

  function isActiveStatus(status) {
    return status === "open";
  }

  function isCancelledBucketStatus(status) {
    return status === "cancelled" || status === "shift_deleted" || status === "approved";
  }

  function getVisibleRequests() {
    const rows = _allRequestsCache.slice().sort((a, b) => {
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });

    if (_currentFilter === "cancelled") {
      return rows.filter((r) => isCancelledBucketStatus(r.status));
    }
    return rows.filter((r) => isActiveStatus(r.status));
  }

  function ensureFilterBar() {
    const container = $("shift-offers-container");
    if (!container) return;

    const modalBody =
      container.parentElement ||
      container.closest(".modal-body") ||
      container.closest(".shift-offers-modal__body") ||
      container.parentNode;

    if (!modalBody) return;

    if ($("shift-offers-filterbar")) return;

    const wrap = document.createElement("div");
    wrap.id = "shift-offers-filterbar";
    wrap.className = "shift-offers-filterbar";
    wrap.innerHTML = `
      <div class="shift-offers-filter-toggle" role="tablist" aria-label="Shift offer filters">
        <button
          type="button"
          id="shift-offers-filter-active"
          class="shift-offers-filter-btn is-active"
          data-filter="active"
          aria-pressed="true"
        >Active</button>
        <button
          type="button"
          id="shift-offers-filter-cancelled"
          class="shift-offers-filter-btn"
          data-filter="cancelled"
          aria-pressed="false"
        >Cancelled</button>
      </div>
    `;

    modalBody.insertBefore(wrap, container);

    wrap.querySelectorAll(".shift-offers-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.filter === "cancelled" ? "cancelled" : "active";
        _currentFilter = next;
        syncFilterButtons();
        renderRequests(getVisibleRequests());
      });
    });
  }

  function syncFilterButtons() {
    const activeBtn = $("shift-offers-filter-active");
    const cancelledBtn = $("shift-offers-filter-cancelled");

    if (activeBtn) {
      const on = _currentFilter === "active";
      activeBtn.classList.toggle("is-active", on);
      activeBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }

    if (cancelledBtn) {
      const on = _currentFilter === "cancelled";
      cancelledBtn.classList.toggle("is-active", on);
      cancelledBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function updateBadge(requests) {
    const badge = $("shift-offers-badge");
    if (!badge) return;

    const openCount = requests.filter((r) => r.status === "open").length;
    badge.textContent = String(openCount);
    badge.hidden = false;
  }

  function renderRequests(requests) {
    ensureFilterBar();
    syncFilterButtons();

    updateBadge(_allRequestsCache);

    const container = $("shift-offers-container");
    if (!container) return;

    if (!requests.length) {
      container.innerHTML = _currentFilter === "cancelled"
        ? '<p class="muted coverage-empty">No cancelled or resolved requests yet.</p>'
        : '<p class="muted coverage-empty">No open shift offers right now.</p>';
      return;
    }

    const uid = currentUID();
    const html = requests
      .map((req) => {
        const isOwn = req.requestingHostId === uid;
        const typeClass = req.eventType || "";
        const isResolved = req.status !== "open";

        let statusBadge = "";
        if (req.status === "shift_deleted") {
          statusBadge = `<span class="coverage-status-badge coverage-status-badge--deleted">SHIFT DELETED</span>`;
        } else if (req.status === "cancelled") {
          statusBadge = `<span class="coverage-status-badge coverage-status-badge--cancelled">REQUEST CANCELLED</span>`;
        } else if (req.status === "approved") {
          statusBadge = `<span class="coverage-status-badge coverage-status-badge--filled">REQUEST FILLED</span>`;
        }

        let actionHtml = "";
        if (!isResolved) {
          if (isOwn) {
            actionHtml = `<span class="coverage-own-label">Your Request</span>`;
          } else {
            actionHtml = `<button
              class="btn small-btn coverage-accept-btn"
              data-req-id="${escHtml(req.id)}"
              type="button"
              aria-label="Accept shift offer for ${escHtml(formatDate(req.shiftDate))}"
            >Accept</button>`;
          }
        }

        const cancelBtn = (!isResolved && isOwn) ? `<button
            class="btn coverage-cancel-btn"
            data-req-id="${escHtml(req.id)}"
            type="button"
            aria-label="Cancel your coverage request for ${escHtml(formatDate(req.shiftDate))}"
            title="Cancel request"
          >✕</button>` : "";

        const resolvedClass = isResolved ? " coverage-card--resolved" : "";

        return `<div class="coverage-card ${escHtml(typeClass)}${resolvedClass}" data-req-id="${escHtml(req.id)}">
          ${cancelBtn}
          <div class="coverage-card-header">
            <span class="coverage-type-badge ${escHtml(typeClass)}">${escHtml(eventLabel(req.eventType))}</span>
            ${statusBadge}
          </div>
          <div class="coverage-card-body">
            <div class="coverage-location"><strong>${escHtml(req.location || "")}</strong></div>
            <div class="coverage-date">${escHtml(formatDate(req.shiftDate))}</div>
            <div class="coverage-time">${escHtml(formatTime(req.startTime))} – ${escHtml(formatTime(req.endTime))}</div>
            <div class="coverage-host">Requested by <strong>${escHtml(req.requestingHostName || "Unknown")}</strong></div>
            ${req.acceptingHostName ? `<div class="coverage-host">Accepted by <strong>${escHtml(req.acceptingHostName)}</strong></div>` : ""}
            ${req.note ? `<div class="coverage-note">"${escHtml(req.note)}"</div>` : ""}
            ${req.createdAt ? `<div class="coverage-timestamp">Submitted ${escHtml(formatTimestamp(req.createdAt))}</div>` : ""}
          </div>
          <div class="coverage-card-footer">
            ${actionHtml}
          </div>
        </div>`;
      })
      .join("");

    container.innerHTML = html;

    container.querySelectorAll(".coverage-accept-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = btn.dataset.reqId;
        if (reqId) acceptOffer(reqId, btn);
      });
    });

    container.querySelectorAll(".coverage-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = btn.dataset.reqId;
        if (reqId) cancelRequest(reqId, btn);
      });
    });
  }

  function refreshBell() {
    try { window.BtNavBell?.refresh?.(); } catch (_) {}
  }

  async function refresh() {
    const container = $("shift-offers-container");
    ensureFilterBar();
    syncFilterButtons();

    const offersModal = $("shift-offers-modal");
    const panelOpen = offersModal && offersModal.getAttribute("aria-hidden") === "false";

    if (container) {
      if (panelOpen) container.innerHTML = '<p class="muted">Loading offers…</p>';
    }

    try {
      const db = firebase.firestore();
      const since = firebase.firestore.Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );

      const snap = await db
        .collection(COLLECTION)
        .where("createdAt", ">", since)
        .orderBy("createdAt", "desc")
        .get();

      let requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      requests = await filterOrphans(db, requests);

      const uid = currentUID();
      _myActiveShiftIds.clear();
      requests.forEach((r) => {
        if (r.shiftId && r.requestingHostId === uid && r.status === "open") {
          _myActiveShiftIds.add(String(r.shiftId));
        }
      });

      _allRequestsCache = requests;

      // Feed the bell dropdown with the same notification-shaped data
      // (keeps bt-nav.js behavior, but avoids continuous onSnapshot reads).
      try {
        window.BtNavBell?.setOffersData?.(
          requests.map((r) =>
            Object.assign({}, r, {
              _notifType:
                r.status === "shift_deleted"
                  ? "coverage_deleted"
                  : r.status === "cancelled"
                    ? "coverage_cancelled"
                    : r.status === "approved"
                      ? "coverage_filled"
                      : "coverage",
            })
          )
        );
      } catch (_) {}

      // Keep the shift-offers count badge correct even if the modal is closed.
      updateBadge(_allRequestsCache);

      // Only render the full modal UI when it's open.
      const panelModal = $("shift-offers-modal");
      const panelOpen = panelModal && panelModal.getAttribute("aria-hidden") === "false";
      if (panelOpen) {
        renderRequests(getVisibleRequests());
      }
    } catch (err) {
      console.error("[ShiftTradeRequests] refresh failed:", err);
      if (container) {
        container.innerHTML = '<p class="muted coverage-error">Could not load shift offers. Please try again.</p>';
      }
    }
  }

  function openRequestModal(shift) {
    const modal = $("coverage-request-modal");
    const summary = $("coverage-shift-summary");
    const noteField = $("coverage-request-note");
    const statusEl = $("coverage-request-status");

    if (!modal || !shift) return;

    if (noteField) noteField.value = "";
    if (statusEl) statusEl.textContent = "";

    modal.dataset.shiftId = shift.id || "";
    modal.dataset.shiftDate = shift.date || "";
    modal.dataset.startTime = shift.startTime || "";
    modal.dataset.endTime = shift.endTime || "";
    modal.dataset.location = shift.location || "";
    modal.dataset.eventType = shift.type || "";

    const typeClass = shift.type || "";
    if (summary) {
      summary.innerHTML = `
        <div class="coverage-summary-row">
          <span class="coverage-type-badge ${escHtml(typeClass)}">${escHtml(eventLabel(shift.type))}</span>
          <strong class="coverage-summary-date">${escHtml(formatDate(shift.date))}</strong>
        </div>
        <div class="coverage-summary-detail">
          <span class="coverage-summary-time">${escHtml(formatTime(shift.startTime))} – ${escHtml(formatTime(shift.endTime))}</span>
          <span class="coverage-summary-sep">·</span>
          <span class="coverage-summary-loc">${escHtml(shift.location || "")}</span>
        </div>
      `;
    }

    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => noteField?.focus(), 60);
  }

  async function submitRequest() {
    const modal = $("coverage-request-modal");
    const noteField = $("coverage-request-note");
    const statusEl = $("coverage-request-status");
    const submitBtn = $("submit-coverage-request");

    if (!modal) return;

    const uid = currentUID();
    if (!uid) {
      if (statusEl) statusEl.textContent = "You must be signed in to request coverage.";
      return;
    }

    const shiftId = modal.dataset.shiftId;
    if (!shiftId) {
      if (statusEl) statusEl.textContent = "Shift data missing — please close and reopen the shift.";
      return;
    }

    try {
      const existing = await firebase
        .firestore()
        .collection(COLLECTION)
        .where("shiftId", "==", shiftId)
        .where("requestingHostId", "==", uid)
        .where("status", "==", "open")
        .limit(1)
        .get();

      if (!existing.empty) {
        if (statusEl) statusEl.textContent = "You already have an open coverage request for this shift.";
        return;
      }
    } catch (err) {
      console.error("[ShiftTradeRequests] duplicate check failed:", err);
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }
    if (statusEl) statusEl.textContent = "";

    try {
      await firebase
        .firestore()
        .collection(COLLECTION)
        .add({
          shiftId,
          shiftDate: modal.dataset.shiftDate || "",
          startTime: modal.dataset.startTime || "",
          endTime: modal.dataset.endTime || "",
          location: modal.dataset.location || "",
          eventType: modal.dataset.eventType || "",
          requestingHostId: uid,
          requestingHostName: currentDisplayName(),
          note: noteField?.value?.trim() || "",
          status: "open",
          acceptingHostId: null,
          acceptingHostName: null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

      if (shiftId) _myActiveShiftIds.add(String(shiftId));

      closeCoverageModal();
      await refresh();
      await refreshBell();

      try { window._updateRequestCoverageButtonIfOpen?.(); } catch (_) {}
    } catch (err) {
      console.error("[ShiftTradeRequests] submitRequest failed:", err);
      if (statusEl) statusEl.textContent = "Failed to submit — please try again.";
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Request";
      }
    }
  }

  async function acceptOffer(reqId, btn) {
    const uid = currentUID();
    if (!uid) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Accepting…";
    }

    try {
      const reqDoc = await firebase.firestore().collection(COLLECTION).doc(reqId).get();
      if (!reqDoc.exists) {
        if (btn) { btn.disabled = false; btn.textContent = "Accept"; }
        return;
      }

      const req = reqDoc.data();
      if (req.status !== "open") {
        await refresh();
        await refreshBell();
        return;
      }

      const acceptingName = currentDisplayName();
      const db = firebase.firestore();
      const batch = db.batch();
      const now = firebase.firestore.FieldValue.serverTimestamp();

      batch.update(db.collection("shifts").doc(req.shiftId), {
        employeeId: uid,
        updatedAt: now,
      });

      batch.update(db.collection(COLLECTION).doc(reqId), {
        status: "approved",
        acceptingHostId: uid,
        acceptingHostName: acceptingName,
        updatedAt: now,
      });

      batch.set(db.collection(NOTIFICATIONS).doc(), {
        coverageRequestId: reqId,
        shiftId: req.shiftId,
        shiftDate: req.shiftDate || "",
        startTime: req.startTime || "",
        endTime: req.endTime || "",
        location: req.location || "",
        eventType: req.eventType || "",
        originalEmployeeId: req.requestingHostId,
        originalEmployeeName: req.requestingHostName || "Unknown",
        acceptingHostId: uid,
        acceptingHostName: acceptingName,
        status: "pending_review",
        createdAt: now,
        reviewedAt: null,
        reviewedBy: null,
      });

      await batch.commit();

      if (req.shiftId) _myActiveShiftIds.delete(String(req.shiftId));

      try { window._updateRequestCoverageButtonIfOpen?.(); } catch (_) {}
      try { window._refreshCalendarIfAvailable?.(); } catch (_) {}

      await refresh();
      await refreshBell();
    } catch (err) {
      console.error("[ShiftTradeRequests] acceptOffer failed:", err);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Accept";
      }
    }
  }

  async function cancelRequest(reqId, btn) {
    const uid = currentUID();
    if (!uid || !reqId) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = "…";
    }

    try {
      const ref = firebase.firestore().collection(COLLECTION).doc(reqId);
      const doc = await ref.get();

      if (!doc.exists || doc.data().requestingHostId !== uid) {
        if (btn) { btn.disabled = false; btn.textContent = "✕"; }
        return;
      }

      await ref.update({
        status: "cancelled",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      const shiftId = doc.data().shiftId;
      if (shiftId) _myActiveShiftIds.delete(String(shiftId));

      try { window._updateRequestCoverageButtonIfOpen?.(); } catch (_) {}

      await refresh();
      await refreshBell();
    } catch (err) {
      console.error("[ShiftTradeRequests] cancelRequest failed:", err);
      if (btn) { btn.disabled = false; btn.textContent = "✕"; }
    }
  }

  function closeCoverageModal() {
    const modal = $("coverage-request-modal");
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    try {
      $("open-shift-offers")?.focus();
    } catch (_) {}
  }

  function wireModal() {
    $("close-coverage-request")?.addEventListener("click", closeCoverageModal);
    $("cancel-coverage-request")?.addEventListener("click", closeCoverageModal);

    $("submit-coverage-request")?.addEventListener("click", () => {
      submitRequest();
    });

    $("coverage-request-modal")?.addEventListener("click", (e) => {
      if (e.target === $("coverage-request-modal")) closeCoverageModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const modal = $("coverage-request-modal");
      if (!modal) return;
      if (modal.getAttribute("aria-hidden") === "false") {
        e.stopPropagation();
        closeCoverageModal();
      }
    });
  }

  async function filterOrphans(db, requests) {
    const shiftIds = [...new Set(
      requests
        .filter((r) => r.status === "open" || r.status === "approved" || r.status === "cancelled")
        .map((r) => r.shiftId)
        .filter(Boolean)
    )];

    if (!shiftIds.length) return requests;

    const shiftChecks = await Promise.all(
      shiftIds.map((id) => db.collection("shifts").doc(id).get())
    );
    const existingShiftIds = new Set(shiftChecks.filter((s) => s.exists).map((s) => s.id));

    requests
      .filter((r) =>
        r.shiftId &&
        !existingShiftIds.has(r.shiftId) &&
        (r.status === "open" || r.status === "approved" || r.status === "cancelled")
      )
      .forEach((r) => {
        db.collection(COLLECTION).doc(r.id).update({
          status: "shift_deleted",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
      });

    return requests.map((r) => {
      if (
        r.shiftId &&
        !existingShiftIds.has(r.shiftId) &&
        (r.status === "open" || r.status === "approved" || r.status === "cancelled")
      ) {
        return { ...r, status: "shift_deleted" };
      }
      return r;
    });
  }

  function startLiveListener() {
    const db = firebase.firestore();

    if (_liveUnsub) {
      try { _liveUnsub(); } catch (_) {}
      _liveUnsub = null;
    }

    const since = firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    _liveUnsub = db.collection(COLLECTION)
      .where("createdAt", ">", since)
      .orderBy("createdAt", "desc")
      .onSnapshot(
        async (snap) => {
          const panelModal = $("shift-offers-modal");
          const panelOpen = panelModal && panelModal.getAttribute("aria-hidden") === "false";

          let requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          requests = await filterOrphans(db, requests);

          _allRequestsCache = requests;

          try {
            window.BtNavBell?.setOffersData?.(
              requests.map((r) => Object.assign({}, r, {
                _notifType:
                  r.status === "shift_deleted" ? "coverage_deleted" :
                  r.status === "cancelled" ? "coverage_cancelled" :
                  r.status === "approved" ? "coverage_filled" :
                  "coverage"
              }))
            );
          } catch (_) {}

          const uid = currentUID();
          _myActiveShiftIds.clear();
          requests.forEach((r) => {
            if (r.shiftId && r.requestingHostId === uid && r.status === "open") {
              _myActiveShiftIds.add(String(r.shiftId));
            }
          });

          if (panelOpen) {
            renderRequests(getVisibleRequests());
          } else {
            updateBadge(requests);
          }
        },
        (err) => console.error("[ShiftTradeRequests] live listener failed:", err)
      );
  }

  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      // Load offers once on page load (read-minimal) and
      // refresh again when the bell opens.
      refresh().then(() => refreshBell()).catch(() => {});
    } else {
      _myActiveShiftIds.clear();
      _allRequestsCache = [];
    }
  });

  window.ShiftTradeRequests = {
    refresh,
    refreshBell,
    openRequestModal,
    hasActiveRequestForShift: (shiftId) => !!shiftId && _myActiveShiftIds.has(String(shiftId)),
  };

  document.addEventListener("DOMContentLoaded", function () {
    wireModal();
    ensureFilterBar();
    syncFilterButtons();
    try { window.BtNavBell?.claimOffersListener?.(); } catch (_) {}

    // Keep bell notifications functional without continuous reads.
    document.addEventListener("bt:bell-open", () => {
      refresh().then(() => refreshBell()).catch(() => {});
    });
  });
})();