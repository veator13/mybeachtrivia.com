(() => {
  if (window.__FINAL_NEG_GUARD__) return; window.__FINAL_NEG_GUARD__ = 1;

  const isFinal = el => el && el.matches && el.matches('input.finalquestion-input');

  function canon(el){
    let s = String(el.value ?? '');
    s = s.replace(/[^\d-]/g,'').replace(/(?!^)-/g,''); // digits + single leading '-'
    if (s === '' || s === '-') return {pending:true};
    el.value = String(Number(s));
    return {pending:false};
  }

  function onInputCapture(e){
    const t = e.target; if (!isFinal(t) || e.isTrusted === false) return;
    e.stopImmediatePropagation();                      // block later clobberers
    Promise.resolve().then(() => {
      const r = canon(t);
      if (!r.pending) t.dispatchEvent(new Event('input', { bubbles:true })); // let totals run
    });
  }

  function onFinishCapture(e){
    const t = e.target; if (!isFinal(t) || e.isTrusted === false) return;
    e.stopImmediatePropagation();
    let s = String(t.value ?? '').replace(/[^\d-]/g,'').replace(/(?!^)-/g,'');
    if (s === '' || s === '-') s = '0';
    t.value = String(Number(s));
    t.dispatchEvent(new Event('input', { bubbles:true }));
  }

  // Register early (capture-phase) so we win over app.js
  document.addEventListener('input',  onInputCapture,  true);
  document.addEventListener('change', onFinishCapture, true);
  document.addEventListener('blur',   onFinishCapture, true);

  // Ensure FINAL inputs accept negatives at the attribute level
  const applyAttrs = () => {
    document.querySelectorAll('input.finalquestion-input').forEach(el => {
      el.removeAttribute('min'); el.setAttribute('step','1');
      el.setAttribute('inputmode','numeric'); el.setAttribute('pattern','-?[0-9]*');
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAttrs, { once:true });
  } else {
    applyAttrs();
  }
  new MutationObserver(applyAttrs).observe(document.documentElement, { childList:true, subtree:true });
})();
