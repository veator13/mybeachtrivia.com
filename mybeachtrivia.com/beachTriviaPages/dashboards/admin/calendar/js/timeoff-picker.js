/**
 * timeoff-picker.js  (Phase 6 — admin calendar only)
 *
 * Subscribes to APPROVED timeOffRequests and:
 *   - greys + sinks hosts with approved time off overlapping the shift-modal
 *     date in the searchable host picker (via option[data-timeoff] + combobox);
 *   - exposes window.TimeOffPicker.confirmAssignment(hostId, ymd) so
 *     event-crud.js can warn before booking a host into their time off.
 *
 * No-ops on the read-only host calendar (window.__CALENDAR_READONLY__).
 */
(function () {
  "use strict";

  if (window.__CALENDAR_READONLY__) return;

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var _approved = [];   // [{ hostId, startDate, endDate }]
  var _unsub = null;

  function isYMD(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  function fmtYMD(ymd) {
    if (!isYMD(ymd)) return ymd || "";
    var p = ymd.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10);
  }

  function rangeLabel(r) {
    if (r.startDate === r.endDate) return fmtYMD(r.startDate);
    return fmtYMD(r.startDate) + " – " + fmtYMD(r.endDate);
  }

  // covering request for a host on a given YYYY-MM-DD (string compare is safe)
  function coverFor(hostId, ymd) {
    if (!hostId || !isYMD(ymd)) return null;
    for (var i = 0; i < _approved.length; i++) {
      var r = _approved[i];
      if (String(r.hostId) === String(hostId) &&
          isYMD(r.startDate) && isYMD(r.endDate) &&
          r.startDate <= ymd && ymd <= r.endDate) {
        return r;
      }
    }
    return null;
  }

  function currentModalDate() {
    var el = document.getElementById("shift-date");
    return el && isYMD(el.value) ? el.value : "";
  }

  function modalOpen() {
    var m = document.getElementById("shift-modal");
    return !!m && m.getAttribute("aria-hidden") === "false";
  }

  // Mark / unmark host <option>s for the current modal date, refresh the combobox.
  function decorate() {
    var sel = document.getElementById("shift-employee");
    if (!sel) return;
    var ymd = currentModalDate();
    var opts = Array.prototype.slice.call(sel.options || []);
    opts.forEach(function (opt) {
      if (!opt.value || opt.value === "__write_in__") {
        if (opt.dataset) delete opt.dataset.timeoff;
        return;
      }
      var r = ymd ? coverFor(opt.value, ymd) : null;
      if (r) {
        opt.dataset.timeoff = "1";
        opt.dataset.timeoffLabel = rangeLabel(r);
      } else if (opt.dataset) {
        delete opt.dataset.timeoff;
        delete opt.dataset.timeoffLabel;
      }
    });
    try {
      if (window._hostCombobox && typeof window._hostCombobox.refresh === "function") {
        window._hostCombobox.refresh();
      }
    } catch (_) {}
  }

  // ── public API ──────────────────────────────────────────────────────────
  window.TimeOffPicker = {
    isHostOff: function (hostId, ymd) { return !!coverFor(hostId, ymd); },
    coverFor: coverFor,
    decorate: decorate,
    /**
     * Returns true to proceed, false to abort. Shows a confirm() when the host
     * has approved time off covering ymd.
     */
    confirmAssignment: function (hostId, ymd) {
      var r = coverFor(hostId, ymd);
      if (!r) return true;
      var name = (window.employees && window.employees[hostId]) || "This host";
      return window.confirm(
        name + " has approved time off (" + rangeLabel(r) + ").\n\n" +
        "Assign them to this shift anyway?"
      );
    }
  };

  // ── data subscription ───────────────────────────────────────────────────
  function start() {
    if (_unsub || !window.firebase || !firebase.firestore) return;
    try {
      _unsub = firebase.firestore()
        .collection("timeOffRequests")
        .where("status", "==", "approved")
        .onSnapshot(function (snap) {
          var list = [];
          snap.forEach(function (doc) {
            var d = doc.data() || {};
            if (isYMD(d.startDate) && isYMD(d.endDate)) {
              list.push({ hostId: d.hostId, startDate: d.startDate, endDate: d.endDate });
            }
          });
          _approved = list;
          if (modalOpen()) decorate();
        }, function (err) {
          console.warn("[timeoff-picker] listener failed:", err);
        });
    } catch (err) {
      console.warn("[timeoff-picker] could not subscribe:", err);
    }
  }

  function wire() {
    var dateEl = document.getElementById("shift-date");
    if (dateEl && !dateEl.dataset.timeoffWired) {
      dateEl.dataset.timeoffWired = "1";
      dateEl.addEventListener("change", decorate);
    }
    var modal = document.getElementById("shift-modal");
    if (modal && !modal.dataset.timeoffWired) {
      modal.dataset.timeoffWired = "1";
      new MutationObserver(function () {
        if (modalOpen()) setTimeout(decorate, 0);
      }).observe(modal, { attributes: true, attributeFilter: ["aria-hidden"] });
    }
  }

  function boot() {
    wire();
    if (window.firebase && firebase.apps && firebase.apps.length) {
      start();
    } else {
      var tries = 0;
      var t = setInterval(function () {
        if (window.firebase && firebase.apps && firebase.apps.length) {
          clearInterval(t);
          start();
        } else if (++tries > 40) {
          clearInterval(t);
        }
      }, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
