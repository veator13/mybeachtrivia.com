/* mybeachtrivia.com/beachTriviaPages/dashboards/host/employee-calendar/js/time-off-modal.js
   Wires the "Manage Time Off" button + modal on the host calendar. All the
   Firestore + form logic lives in the shared window.BtTimeOff module. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let _wired = false;
  let _formWired = false;
  let _unsub = null;

  function modal() { return $("timeoff-modal"); }

  function open() {
    const m = modal();
    if (!m) return;
    m.setAttribute("aria-hidden", "false");
    ensureFormWired();
    startListener();
    setTimeout(() => $("to-modal-start")?.focus(), 60);
  }

  function close() {
    modal()?.setAttribute("aria-hidden", "true");
    if (_unsub) { try { _unsub(); } catch (_) {} _unsub = null; }
    try { $("open-timeoff")?.focus(); } catch (_) {}
  }

  function ensureFormWired() {
    if (_formWired || !window.BtTimeOff) return;
    _formWired = true;
    BtTimeOff.wireForm({
      start: $("to-modal-start"),
      end: $("to-modal-end"),
      note: $("to-modal-note"),
      warning: $("to-modal-warning"),
      status: $("to-modal-status"),
      submitBtn: $("to-modal-submit"),
    });
  }

  function startListener() {
    if (!window.BtTimeOff) return;
    if (_unsub) { try { _unsub(); } catch (_) {} }
    _unsub = BtTimeOff.subscribeMine(function (requests) {
      BtTimeOff.renderList($("to-modal-list"), requests, {
        emptyText: "You haven't requested any time off yet.",
      });
    });
  }

  function wire() {
    if (_wired) return;
    _wired = true;

    $("open-timeoff")?.addEventListener("click", open);
    $("close-timeoff")?.addEventListener("click", close);

    modal()?.addEventListener("click", (e) => {
      if (e.target === modal()) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal()?.getAttribute("aria-hidden") === "false") {
        e.stopPropagation();
        close();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", wire);
})();
