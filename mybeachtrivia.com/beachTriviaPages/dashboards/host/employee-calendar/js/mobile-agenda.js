/* mybeachtrivia.com/beachTriviaPages/dashboards/host/employee-calendar/js/mobile-agenda.js
 *
 * Mobile view for the host calendar. The 7-column month <table> is unreadable
 * on a phone, so at <= 720px CSS hides it and shows this vertical agenda
 * instead: one card per day-that-has-shifts for the month currently in view,
 * newest logic reused from the desktop calendar —
 *
 *   - data:        window.shifts        (host-calendar.js keeps this current)
 *   - month/filter: window.state        (currentYear / currentMonth / filters)
 *   - shift tile:   window.createShiftElement(shift)  (so a tap opens the same
 *                   read-only detail modal via the document-level
 *                   `.shift[data-id]` click delegate in host-calendar.js)
 *
 * Re-renders after every renderCalendar() (month nav, filter change, live data)
 * and on resize / orientation change. Desktop is untouched.
 */
(function () {
  "use strict";

  var BP = 768; // keep in sync with the @media block in style.css
  var _raf = 0;

  function isMobile() {
    return window.matchMedia("(max-width: " + BP + "px)").matches;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }

  function todayStr() {
    var d = new Date();
    return ymd(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function hostEl() {
    var el = document.getElementById("calendar-agenda");
    if (!el) {
      el = document.createElement("div");
      el.id = "calendar-agenda";
      el.setAttribute("aria-label", "Schedule");
      var c = document.querySelector(".calendar-container");
      if (c && c.parentNode) c.parentNode.insertBefore(el, c.nextSibling);
      else document.body.appendChild(el);
    }
    return el;
  }

  function passesFilter(s, f) {
    if (!f) return true;
    if (f.employee && f.employee !== "all" && String(s.employeeId) !== String(f.employee)) return false;
    if (f.eventType && f.eventType !== "all" && s.type !== f.eventType) return false;
    if (f.location && f.location !== "all" && s.location !== f.location) return false;
    return true;
  }

  // "7:00 PM" / "19:00" -> minutes past midnight, for sorting within a day.
  function toMinutes(t) {
    var s = String(t || "").trim();
    var m = /^(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?/i.exec(s);
    if (m) {
      var h = parseInt(m[1], 10) % 12;
      if (m[3].toLowerCase() === "p") h += 12;
      return h * 60 + parseInt(m[2], 10);
    }
    m = /^(\d{1,2}):(\d{2})/.exec(s);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    return 9999;
  }

  function render() {
    var el = hostEl();

    if (!isMobile()) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;

    var st = window.state || {};
    var y = st.currentYear, m = st.currentMonth;
    if (y == null || m == null) {
      var now = new Date();
      y = now.getFullYear();
      m = now.getMonth();
    }
    var filters = st.filters || {};
    var all = Array.isArray(window.shifts) ? window.shifts : [];
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var today = todayStr();
    var offSet = (window._hostTimeOffDays && typeof window._hostTimeOffDays.has === "function")
      ? window._hostTimeOffDays : null;

    var frag = document.createDocumentFragment();
    var shiftCount = 0;

    for (var d = 1; d <= daysInMonth; d++) {
      var ds = ymd(y, m, d);
      var isOff = offSet ? offSet.has(ds) : false;

      var list = all.filter(function (s) {
        return s.date === ds && passesFilter(s, filters);
      });
      if (!list.length && !isOff) continue;

      list.sort(function (a, b) { return toMinutes(a.startTime) - toMinutes(b.startTime); });
      shiftCount += list.length;

      var dObj = new Date(y, m, d);
      var card = document.createElement("section");
      card.className = "agenda-day";
      if (ds === today) card.classList.add("agenda-day--today");
      if (isOff) card.classList.add("agenda-day--timeoff");

      var head = document.createElement("div");
      head.className = "agenda-day__head";
      head.innerHTML =
        '<span class="agenda-day__dow">' +
          dObj.toLocaleDateString("en-US", { weekday: "short" }) +
        '</span>' +
        '<span class="agenda-day__num">' + d + '</span>' +
        '<span class="agenda-day__mon">' +
          dObj.toLocaleDateString("en-US", { month: "short" }) +
        '</span>' +
        (isOff ? '<span class="agenda-day__tag">TIME OFF</span>' : "");
      card.appendChild(head);

      var body = document.createElement("div");
      body.className = "agenda-day__shifts";
      if (list.length) {
        list.forEach(function (s) {
          try {
            var node = window.createShiftElement && window.createShiftElement(s);
            if (node) {
              node.classList.remove("collapsed");
              body.appendChild(node);
            }
          } catch (e) { /* skip a bad shift, keep the rest */ }
        });
      } else {
        var none = document.createElement("p");
        none.className = "agenda-day__none";
        none.textContent = "No shifts scheduled.";
        body.appendChild(none);
      }
      card.appendChild(body);
      frag.appendChild(card);
    }

    el.innerHTML = "";
    if (!frag.childNodes.length) {
      var empty = document.createElement("p");
      empty.className = "agenda-empty";
      empty.textContent = "No shifts this month.";
      el.appendChild(empty);
    } else {
      el.appendChild(frag);
    }
  }

  function schedule() {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(function () {
      _raf = 0;
      try { render(); } catch (e) { console.warn("[mobile-agenda] render failed:", e); }
    });
  }

  // Compose with whatever else has wrapped renderCalendar (host-calendar.js
  // already wraps it once for the time-off highlight).
  function installHook() {
    if (window.__HOST_AGENDA_HOOK__) return;
    var orig = window.renderCalendar;
    if (typeof orig !== "function") { setTimeout(installHook, 150); return; }
    window.__HOST_AGENDA_HOOK__ = true;
    window.renderCalendar = function () {
      var out = orig.apply(this, arguments);
      schedule();
      return out;
    };
    schedule();
  }

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installHook);
  } else {
    installHook();
  }

  window.BtMobileAgenda = { render: render, schedule: schedule };
})();
