(function preauth(){
  function go(){
    if (!window.firebase || !firebase.auth) return setTimeout(go, 50);
    const auth = firebase.auth();
    auth.setPersistence('local').catch(()=>{});
    if (!auth.currentUser) auth.signInAnonymously().catch(()=>{});
  }
  go();
})();
