// employees-management/invite.js
(function () {
    if (typeof firebase === "undefined" || !firebase.apps || !firebase.apps.length) {
      console.error("[invite] Firebase not initialized.");
      return;
    }
  
    const auth = firebase.auth();
    const db   = firebase.firestore();
  
    // Where the email-link flow should end up (routes through start-google.html).
    const RETURN_TO = "https://mybeachtrivia.com/login.html";
    const actionCodeSettings = {
      url: "https://mybeachtrivia.com/start-google.html?return=" + encodeURIComponent(RETURN_TO),
      handleCodeInApp: true
      // If you later add Dynamic Links: dynamicLinkDomain: "YOUR.page.link"
    };
  
    async function sendHostInvite() {
      const statusEl = document.getElementById("invite-status");
      const btn      = document.getElementById("send-invite-btn");
      const emailEl  = document.getElementById("invite-email");
      const roleEl   = document.getElementById("invite-role");
      const activeEl = document.getElementById("invite-active");
  
      if (!emailEl || !roleEl || !activeEl || !btn) return;
  
      const email  = (emailEl.value || "").trim().toLowerCase();
      const role   = roleEl.value || "host";
      const active = !!activeEl.checked;
  
      if (!email) { alert("Please enter an email."); return; }
  
      btn.disabled = true;
      if (statusEl) statusEl.textContent = "Sending invite…";
  
      try {
        // 1) Write an invite doc the new user will redeem on first login
        await db.collection("employeeInvites").add({
          email,
          role,
          active,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
  
        // 2) Send passwordless email link
        await auth.sendSignInLinkToEmail(email, actionCodeSettings);
  
        if (statusEl) {
          statusEl.textContent =
            `Invite sent to ${email}. They'll click the link, sign in, and their profile will be created automatically.`;
        }
        try { window.localStorage.setItem("emailForSignIn", email); } catch {}
  
      } catch (err) {
        console.error("[invite] sendHostInvite error:", err);
        alert("Error sending invite: " + (err?.message || err?.code || String(err)));
        if (statusEl) statusEl.textContent = "";
      } finally {
        btn.disabled = false;
      }
    }
  
    // Wire up the button (safe if element isn’t present yet)
    document.addEventListener("DOMContentLoaded", () => {
      const btn = document.getElementById("send-invite-btn");
      if (btn) btn.addEventListener("click", sendHostInvite);
    });
  })();
  