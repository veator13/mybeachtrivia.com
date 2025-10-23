(function(){
  // Global reveal used by script.js when setup is required
  window._showSetup = function(){
    try { document.body.classList.remove('precheck-hide'); } catch(e){}
  };
  // Fail-open after 8s if something blocks the flow
  setTimeout(function(){
    if (document.body && document.body.classList.contains('precheck-hide')) {
      window._showSetup();
    }
  }, 8000);
})();
