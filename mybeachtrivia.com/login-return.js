(function(){
  try {
    var p = new URLSearchParams(location.search);
    var t = p.get('return') || p.get('next') || p.get('redirect');
    if (t) {
      sessionStorage.setItem('afterLogin', t);
      console.log('[login-return] saved afterLogin =', t);
    } else {
      console.log('[login-return] no return/next/redirect param');
    }
  } catch (e) {
    console.warn('[login-return] error', e);
  }
})();
