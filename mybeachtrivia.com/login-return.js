(function(){
  try {
    var p = new URLSearchParams(location.search);
    var t = p.get('return') || p.get('next') || p.get('redirect');
    if (t) {
      sessionStorage.setItem('afterLogin', t);
      console.log('[login-return] saved afterLogin =', t);
    } else {
      sessionStorage.removeItem('afterLogin');
      console.log('[login-return] cleared afterLogin (no param)');
    }
  } catch (e) { console.warn('[login-return] error', e); }
})();
