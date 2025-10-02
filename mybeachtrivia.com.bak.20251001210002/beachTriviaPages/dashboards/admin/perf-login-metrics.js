(function () {
  function n(x){ return Number(x)||0; }
  function ms(a,b){ return (n(b)-n(a)); }
  function log(label, v){ if (v>=0 && v<600000) console.log(`⏱️ [login-metrics] ${label}: ${v}ms`); }

  // Run at DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const click = sessionStorage.getItem('bt_login_click');        // set on login page
      const left  = sessionStorage.getItem('bt_login_pagehide');     // set on login page
      const now   = Date.now();

      if (click && left)   log('click → left login page', ms(click, left));
      if (click)           log('click → admin DOM ready', ms(click, now));

      // clean up so subsequent reloads don't re-log old values
      sessionStorage.removeItem('bt_login_click');
      sessionStorage.removeItem('bt_login_pagehide');
    } catch (e) {}
  });
})();

console.log('[login-metrics] reader active');
