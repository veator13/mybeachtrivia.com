/* mybeachtrivia.com/beachTriviaPages/dashboards/admin/requests/requests.js
 *
 * Admin "Requests" page — read-only audit log with two tabs:
 *   Time Off   ← timeOffRequests        (ordered by submittedAt desc)
 *   Shift Swaps ← shiftCoverageRequests  (ordered by createdAt desc)
 *
 * Admins can read every doc in both collections (Firestore rules), so no
 * per-host lookups are needed — the docs already carry the names.
 */
(function () {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var EVENT_LABELS = {
    "classic-trivia": "Classic Trivia",
    "themed-trivia": "Themed Trivia",
    "classic-bingo": "Classic Bingo",
    "music-bingo": "Music Bingo",
    "beach-feud": "Beach Feud"
  };

  var TIMEOFF_STATUS = {
    pending: "Pending", approved: "Approved", denied: "Denied", cancelled: "Cancelled"
  };
  var SWAP_STATUS = {
    open: "Open", pending_admin: "Pending approval", approved: "Approved",
    rejected: "Rejected", cancelled: "Cancelled", expired: "Expired",
    shift_deleted: "Shift deleted"
  };

  var state = { tab: "timeoff", status: "", q: "" };
  var toRows = [];
  var swRows = [];
  var unsubTO = null;
  var unsubSW = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function cell(text, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    td.textContent = text == null || text === "" ? "—" : String(text);
    return td;
  }

  // ── formatting ─────────────────────────────────────────────────────────
  function fmtTS(ts) {
    if (!ts) return "";
    var d = ts.toDate ? ts.toDate()
          : (typeof ts.seconds === "number" ? new Date(ts.seconds * 1000)
          : new Date(ts));
    if (isNaN(d.getTime())) return "";
    return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function fmtYMD(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return s || "";
    var p = s.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) + ", " + p[0];
  }

  function fmtRange(a, b) {
    if (!a) return "";
    if (!b || a === b) return fmtYMD(a);
    // Same year → "Sep 22 – 24, 2026"
    if (a.slice(0, 4) === b.slice(0, 4)) {
      var pa = a.split("-"), pb = b.split("-");
      if (pa[1] === pb[1]) {
        return MONTHS[+pa[1] - 1] + " " + (+pa[2]) + " – " + (+pb[2]) + ", " + pa[0];
      }
      return MONTHS[+pa[1] - 1] + " " + (+pa[2]) + " – " +
             MONTHS[+pb[1] - 1] + " " + (+pb[2]) + ", " + pa[0];
    }
    return fmtYMD(a) + " – " + fmtYMD(b);
  }

  function dayCount(a, b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a || "")) return null;
    var d1 = new Date(a + "T00:00:00");
    var d2 = new Date((b || a) + "T00:00:00");
    if (isNaN(d1) || isNaN(d2)) return null;
    return Math.round((d2 - d1) / 86400000) + 1;
  }

  function statusPill(status, map) {
    var span = document.createElement("span");
    span.className = "pill pill-" + String(status || "unknown").replace(/[^a-z_]/gi, "");
    span.textContent = (map && map[status]) || status || "—";
    return span;
  }

  // ── data ───────────────────────────────────────────────────────────────
  function start() {
    var db = firebase.firestore();

    unsubTO = db.collection("timeOffRequests")
      .orderBy("submittedAt", "desc")
      .onSnapshot(function (snap) {
        toRows = snap.docs.map(function (d) {
          var x = d.data() || {};
          return { id: d.id, __d: x };
        });
        render();
      }, function (err) { console.error("[requests] time-off listener:", err); });

    unsubSW = db.collection("shiftCoverageRequests")
      .orderBy("createdAt", "desc")
      .onSnapshot(function (snap) {
        swRows = snap.docs.map(function (d) {
          var x = d.data() || {};
          return { id: d.id, __d: x };
        });
        render();
      }, function (err) { console.error("[requests] swaps listener:", err); });
  }

  // ── filtering ──────────────────────────────────────────────────────────
  function matchesQuery(hay) {
    if (!state.q) return true;
    return hay.toLowerCase().indexOf(state.q.toLowerCase()) !== -1;
  }

  function filteredTimeOff() {
    return toRows.filter(function (r) {
      var x = r.__d;
      if (state.status && x.status !== state.status) return false;
      return matchesQuery([x.hostName, x.note, x.denialReason].filter(Boolean).join(" "));
    });
  }

  function filteredSwaps() {
    return swRows.filter(function (r) {
      var x = r.__d;
      if (state.status && x.status !== state.status) return false;
      return matchesQuery([
        x.requestingHostName, x.acceptingHostName, x.targetHostName,
        x.location, x.rejectionReason
      ].filter(Boolean).join(" "));
    });
  }

  // ── render ─────────────────────────────────────────────────────────────
  function buildStatusOptions() {
    var sel = $("#statusFilter");
    var map = state.tab === "timeoff" ? TIMEOFF_STATUS : SWAP_STATUS;
    var cur = state.status;
    sel.innerHTML = "";
    var all = document.createElement("option");
    all.value = ""; all.textContent = "All statuses";
    sel.appendChild(all);
    Object.keys(map).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = map[k];
      sel.appendChild(o);
    });
    sel.value = Array.from(sel.options).some(function (o) { return o.value === cur; }) ? cur : "";
    state.status = sel.value;
  }

  function renderTimeOff() {
    var body = $("#timeoffBody");
    body.innerHTML = "";
    var rows = filteredTimeOff();
    rows.forEach(function (r) {
      var x = r.__d;
      var tr = document.createElement("tr");

      tr.appendChild(cell(x.hostName || x.hostId));

      var dc = dayCount(x.startDate, x.endDate);
      var datesTd = cell(fmtRange(x.startDate, x.endDate));
      if (dc) {
        var sm = document.createElement("span");
        sm.className = "sub";
        sm.textContent = " (" + dc + (dc === 1 ? " day" : " days") + ")";
        datesTd.appendChild(sm);
      }
      tr.appendChild(datesTd);

      var reqTd = cell(fmtTS(x.submittedAt));
      if (x.insideTwoWeeks) {
        var flag = document.createElement("span");
        flag.className = "flag-inside";
        flag.textContent = "inside 2 wks";
        reqTd.appendChild(flag);
      }
      tr.appendChild(reqTd);

      var stTd = document.createElement("td");
      stTd.appendChild(statusPill(x.status, TIMEOFF_STATUS));
      if (x.status === "approved" && x.conflictResolution && x.conflictResolution !== "none") {
        var cr = document.createElement("span");
        cr.className = "sub";
        cr.textContent = " " + x.conflictResolution;
        stTd.appendChild(cr);
      }
      tr.appendChild(stTd);

      tr.appendChild(cell(x.status === "cancelled" ? fmtTS(x.cancelledAt || x.updatedAt) : fmtTS(x.reviewedAt)));
      tr.appendChild(cell(x.status === "cancelled" ? "host" : (x.reviewedByName || "")));
      tr.appendChild(cell(x.denialReason || x.note || ""));

      body.appendChild(tr);
    });
    return rows.length;
  }

  function renderSwaps() {
    var body = $("#swapsBody");
    body.innerHTML = "";
    var rows = filteredSwaps();
    rows.forEach(function (r) {
      var x = r.__d;
      var tr = document.createElement("tr");

      var typeTd = document.createElement("td");
      var t = document.createElement("span");
      var direct = (x.offerType || "open") === "direct";
      t.className = "tag " + (direct ? "tag-direct" : "tag-open");
      t.textContent = direct ? "Direct" : "Open";
      typeTd.appendChild(t);
      tr.appendChild(typeTd);

      var shiftBits = [
        fmtYMD(x.shiftDate),
        x.location,
        EVENT_LABELS[x.eventType] || x.eventType
      ].filter(Boolean).join(" · ");
      tr.appendChild(cell(shiftBits));

      tr.appendChild(cell(x.requestingHostName || x.requestingHostId));
      tr.appendChild(cell(
        x.acceptingHostName ||
        (direct ? (x.targetHostName ? x.targetHostName + " (target)" : "") : "") ||
        ""
      ));
      tr.appendChild(cell(fmtTS(x.createdAt)));
      tr.appendChild(cell(fmtTS(x.acceptedAt)));

      var stTd = document.createElement("td");
      stTd.appendChild(statusPill(x.status, SWAP_STATUS));
      tr.appendChild(stTd);

      tr.appendChild(cell(fmtTS(x.adminReviewedAt)));

      var byTd = cell(x.adminReviewedByName || "");
      if (x.rejectionReason) {
        var rr = document.createElement("div");
        rr.className = "sub";
        rr.textContent = x.rejectionReason;
        byTd.appendChild(rr);
      }
      tr.appendChild(byTd);

      body.appendChild(tr);
    });
    return rows.length;
  }

  function render() {
    $("#tab-badge-timeoff").textContent = toRows.length;
    $("#tab-badge-swaps").textContent = swRows.length;

    var isTO = state.tab === "timeoff";
    $("#timeoffTable").hidden = !isTO;
    $("#swapsTable").hidden = isTO;

    var shown = isTO ? renderTimeOff() : renderSwaps();
    var total = isTO ? toRows.length : swRows.length;

    $("#rowCount").textContent = shown === total
      ? shown + (shown === 1 ? " request" : " requests")
      : shown + " of " + total + " shown";

    var empty = $("#emptyState");
    empty.hidden = shown !== 0;
    if (!empty.hidden) {
      var filtered = state.status || state.q;
      empty.textContent = total === 0
        ? (isTO ? "No time-off requests yet." : "No shift swaps yet.")
        : (filtered ? "No requests match your filters." : "Nothing to show.");
    }
  }

  // ── wire ───────────────────────────────────────────────────────────────
  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (btn) {
      btn.addEventListener("click", function () {
        if (btn.dataset.tab === state.tab) return;
        document.querySelectorAll(".seg-btn").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        state.tab = btn.dataset.tab;
        state.status = "";
        buildStatusOptions();
        render();
      });
    });

    $("#statusFilter").addEventListener("change", function () {
      state.status = this.value;
      render();
    });

    var searchT;
    $("#searchBox").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(searchT);
      searchT = setTimeout(function () { state.q = v.trim(); render(); }, 150);
    });

    buildStatusOptions();
  }

  function boot() {
    wire();
    if (window.firebase && firebase.apps && firebase.apps.length) {
      start();
    } else {
      var tries = 0;
      var t = setInterval(function () {
        if (window.firebase && firebase.apps && firebase.apps.length) {
          clearInterval(t); start();
        } else if (++tries > 40) { clearInterval(t); }
      }, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
