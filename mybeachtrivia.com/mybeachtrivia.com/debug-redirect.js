(function(){
  try {
    function log(){
      try {
        const msg = Array.from(arguments).map(a => {
          if (a instanceof Error) return a.stack || String(a);
          try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
        console.log('[DEBUG-REDIR]', msg);
        const arr = JSON.parse(sessionStorage.getItem('DEBUG_REDIR') || '[]');
        arr.push({t:Date.now(), msg});
        sessionStorage.setItem('DEBUG_REDIR', JSON.stringify(arr).slice(-8000));
      } catch(e){}
    }

    // Hook assign/replace
    var _assign  = location.assign.bind(location);
    var _replace = location.replace.bind(location);
    location.assign  = function(u){ log('location.assign →', u, new Error('stack').stack); _assign(u); };
    location.replace = function(u){ log('location.replace →', u, new Error('stack').stack); _replace(u); };

    // Hook pushState (some code uses router-style redirects)
    var _push = history.pushState.bind(history);
    history.pushState = function(s,t,u){ log('history.pushState →', u); return _push(s,t,u); };

    // Log afterLogin + URL param on load
    var params = new URLSearchParams(location.search);
    log('loaded login.html with', {return: params.get('return'), next: params.get('next'), redirect: params.get('redirect')});
    log('sessionStorage.afterLogin =', sessionStorage.getItem('afterLogin'));

    // Log auth state when Firebase is ready
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if (window.firebase && firebase.auth) {
        clearInterval(iv);
        firebase.auth().onAuthStateChanged(function(user){
          log('onAuthStateChanged:', !!user, user && user.uid);
        });
      } else if (tries > 50) {
        clearInterval(iv);
        log('firebase.auth not found after waiting');
      }
    }, 100);
  } catch(e) {
    console.warn('[DEBUG-REDIR] init error', e);
  }
})();
