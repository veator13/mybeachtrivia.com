(function () {
  const t0 = performance.now();
  function mark(label){
    console.log(`⏱️ [probe] ${label}: +${Math.round(performance.now()-t0)}ms`);
  }
  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'));
  window.addEventListener('load', () => mark('window.load'));
  window.__probe = { mark };
})();
