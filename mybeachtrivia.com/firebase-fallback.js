// firebase-fallback.js — replaces inline fallback from login.html
window.addEventListener('load', function() {
    console.log("Window loaded, checking Firebase availability");
    if (typeof firebase === 'undefined') {
      console.error("Firebase is NOT available after window load");
  
      const loadScript = (src) => new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        document.body.appendChild(s);
      });
  
      (async () => {
        await loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
        console.log("Firebase app loaded dynamically");
        await loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js");
        console.log("Firebase auth loaded dynamically");
        await loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js");
        console.log("Firebase firestore loaded dynamically");
        await loadScript("/login.js?v=uidfix5");
        console.log("Reloaded login.js after Firebase fallback load");
      })();
    }
  });
  