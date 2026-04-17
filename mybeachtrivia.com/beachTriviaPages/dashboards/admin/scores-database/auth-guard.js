// auth-guard.js — Protect Scores Database page (Firebase compat SDK)

document.addEventListener('DOMContentLoaded', () => {
    'use strict';
  
    // --- Hide page until verified ---
    const style = document.createElement('style');
    style.textContent = `
      html.auth-locked { visibility: hidden; }
      .auth-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.82);
        color: #fff;
        z-index: 9999;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
    `;
    document.head.appendChild(style);
    document.documentElement.classList.add('auth-locked');
  
    const overlay = document.getElementById('auth-loading');
    const errorContainer = document.getElementById('error-container');
    const errorText = document.getElementById('error-text');
    const backToLoginBtn = document.getElementById('back-to-login');
  
    function showError(message) {
      console.error('[scores-database auth-guard] ' + message);
  
      if (overlay) overlay.style.display = 'none';
      if (errorText) errorText.textContent = message;
      if (errorContainer) errorContainer.style.display = 'flex';
  
      document.documentElement.classList.remove('auth-locked');
    }
  
    function goToLogin() {
      const returnTo = '/beachTriviaPages/dashboards/admin/scores-database/';
      window.location.assign('/login.html?return=' + encodeURIComponent(returnTo) + '&role=admin');
    }
  
    if (backToLoginBtn) {
      backToLoginBtn.addEventListener('click', goToLogin);
    }
  
    if (typeof firebase === 'undefined' || !firebase.auth || !firebase.firestore) {
      showError('Firebase failed to load. Please refresh and try again.');
      return;
    }
  
    const auth = firebase.auth();
    const db = firebase.firestore();
  
    function extractRoles(docData = {}) {
      const arr = Array.isArray(docData.roles) ? docData.roles : [];
      const single = docData.role ? [docData.role] : [];
      return [...new Set([...arr, ...single].filter(Boolean).map(r => String(r).toLowerCase()))];
    }
  
    function cacheEmployeeDoc(uid, emp) {
      try {
        sessionStorage.setItem('bt:empCache', JSON.stringify({
          uid,
          emp,
          ts: Date.now(),
        }));
      } catch (_) {}
    }
  
    async function getEmployeeDoc(user) {
      const cached = (() => {
        try {
          const raw = sessionStorage.getItem('bt:empCache');
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || parsed.uid !== user.uid) return null;
          if (Date.now() - (parsed.ts || 0) > 4 * 60 * 60 * 1000) return null;
          return parsed.emp || null;
        } catch (_) {
          return null;
        }
      })();
  
      if (cached) return cached;
  
      const snap = await db.collection('employees').doc(user.uid).get();
      if (!snap.exists) return null;
  
      const emp = snap.data() || {};
      cacheEmployeeDoc(user.uid, emp);
      return emp;
    }
  
    auth.onAuthStateChanged(async (user) => {
      try {
        if (!user) {
          goToLogin();
          return;
        }
  
        const emp = await getEmployeeDoc(user);
        if (!emp) {
          showError('No employee record was found for this account.');
          return;
        }
  
        if (emp.active === false) {
          showError('Your account is inactive. Please contact an administrator.');
          return;
        }
  
        const roles = extractRoles(emp);
        if (!roles.includes('admin')) {
          showError('Admin access is required to view the Scores Database.');
          return;
        }
  
        console.log('[scores-database auth-guard] Admin access verified for:', user.email || user.uid);
  
        try { sessionStorage.setItem('bt:selectedRole', 'admin'); } catch (_) {}
        try { localStorage.setItem('bt:selectedRole', 'admin'); } catch (_) {}
        try { sessionStorage.setItem('bt:activeRole', 'admin'); } catch (_) {}
        try { localStorage.setItem('bt:activeRole', 'admin'); } catch (_) {}
  
        if (errorContainer) errorContainer.style.display = 'none';
        document.documentElement.classList.remove('auth-locked');
        document.body.dataset.authReady = 'true';
  
        window.__SCORES_DATABASE_AUTH_READY__ = true;
        window.__SCORES_DATABASE_USER__ = user;
        window.__SCORES_DATABASE_EMPLOYEE__ = emp;
  
        document.dispatchEvent(new CustomEvent('scores-database:auth-ready', {
          detail: { user, emp }
        }));
      } catch (err) {
        console.error('[scores-database auth-guard] verification error:', err);
        showError(err?.message || 'Could not verify access. Please try again.');
      }
    });
  });