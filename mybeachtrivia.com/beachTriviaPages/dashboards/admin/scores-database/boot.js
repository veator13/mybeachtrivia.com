// boot.js — Scores Database page boot / reveal logic
(function () {
    'use strict';
  
    function $(sel, root = document) {
      return root.querySelector(sel);
    }
  
    const els = {
      overlay: $('#auth-loading'),
      errorContainer: $('#error-container'),
      pageShell: $('.page-shell'),
      backToLogin: $('#back-to-login'),
    };
  
    function hideOverlay() {
      if (els.overlay) els.overlay.style.display = 'none';
    }
  
    function showOverlay() {
      if (els.overlay) els.overlay.style.display = 'flex';
    }
  
    function hideError() {
      if (els.errorContainer) els.errorContainer.style.display = 'none';
    }
  
    function showPage() {
      if (els.pageShell) els.pageShell.style.display = 'block';
      document.documentElement.classList.remove('auth-locked');
      document.body.dataset.pageVisible = 'true';
    }
  
    function hidePage() {
      if (els.pageShell) els.pageShell.style.display = 'none';
      document.body.dataset.pageVisible = 'false';
    }
  
    function goToLogin() {
      const returnTo = '/beachTriviaPages/dashboards/admin/scores-database/';
      window.location.assign('/login.html?return=' + encodeURIComponent(returnTo) + '&role=admin');
    }
  
    function revealIfAuthorized() {
      if (!window.__SCORES_DATABASE_AUTH_READY__) return false;
  
      hideError();
      hideOverlay();
      showPage();
  
      const user = window.__SCORES_DATABASE_USER__ || null;
      const emp = window.__SCORES_DATABASE_EMPLOYEE__ || null;
  
      document.dispatchEvent(new CustomEvent('scores-database:boot-ready', {
        detail: { user, emp }
      }));
  
      return true;
    }
  
    function init() {
      hidePage();
      showOverlay();
  
      if (els.backToLogin) {
        els.backToLogin.addEventListener('click', goToLogin);
      }
  
      // Fast path: auth guard already finished
      if (revealIfAuthorized()) return;
  
      // Normal path: wait for auth guard
      document.addEventListener('scores-database:auth-ready', function handleAuthReady(ev) {
        revealIfAuthorized();
      }, { once: true });
  
      // Safety fallback: if auth never resolves, at least unlock the HTML if an error is shown
      window.setTimeout(() => {
        const errorVisible = !!(els.errorContainer && els.errorContainer.style.display !== 'none');
        if (errorVisible) {
          hideOverlay();
          document.documentElement.classList.remove('auth-locked');
        }
      }, 8000);
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  })();