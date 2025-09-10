// home.js — swaps LOGIN → MY DASHBOARD when signed in
// and routes to the correct dashboard based on employees/{uid}.roles

(function () {
    if (typeof firebase === "undefined") {
      console.error("Firebase SDK missing on home page.");
      return;
    }
    const auth = firebase.auth();
    const db   = firebase.firestore();
  
    const loginBtn = document.getElementById("loginButton");
    if (!loginBtn) return;
  
    // default state (works even if JS fails)
    loginBtn.textContent = "LOGIN";
    loginBtn.href = "login.html";
  
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        // signed-out: leave LOGIN link
        return;
      }
  
      // signed-in: show MY DASHBOARD and route on click
      loginBtn.textContent = "MY DASHBOARD";
      loginBtn.href = "#"; // JS will handle routing
      loginBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const snap = await db.collection("employees").doc(user.uid).get();
          if (!snap.exists) {
            // no profile yet → send to login (they’ll get messaging there)
            return (location.href = "/login.html");
          }
          const data  = snap.data() || {};
          const roles = Array.isArray(data.roles) ? data.roles : [];
  
          // choose destination by role (admin > host)
          let dest = "/index.html"; // fallback
          if (roles.includes("admin")) dest = "/beachTriviaPages/dashboards/admin/";
          else if (roles.includes("host")) dest = "/beachTriviaPages/dashboards/host/";
  
          location.href = dest;
        } catch (err) {
          console.error("Dashboard routing error:", err);
          location.href = "/login.html";
        }
      }, { once: true });
    });
  })();