/* auth-probe.js */
window.__t0 = performance.now();

(function hookAuthProbe(){
  function wrapNow(){
    try {
      const auth = firebase && firebase.auth && firebase.auth();
      if (!auth) return; // firebase not ready yet
      const orig = auth.signInWithEmailAndPassword.bind(auth);

      // Wrap signIn to measure duration
      auth.signInWithEmailAndPassword = function(email, password){
        console.log("[probe] signIn start");
        const t0 = performance.now();
        return orig(email, password).then(res => {
          console.log("[probe] signIn resolved in", Math.round(performance.now()-t0), "ms");
          return res;
        });
      };

      // Log the exact moment the submit is clicked
      window.addEventListener("click", (e)=>{
        const btn = e.target && e.target.closest('button[type="submit"], [type="submit"]');
        if(btn) console.log("[probe] click @", Math.round(performance.now()-window.__t0), "ms");
      }, {capture:true});

    } catch(e) {
      console.warn("[probe] auth hook error:", e);
    }
  }

  // Try immediately, and again on DOMContentLoaded (in case firebase not ready yet)
  wrapNow();
  document.addEventListener("DOMContentLoaded", wrapNow, {once:true});
})();
